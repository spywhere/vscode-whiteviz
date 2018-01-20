"use strict";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
    const whiteViz = new WhiteViz();
    context.subscriptions.push(whiteViz);
    context.subscriptions.push(new WhiteVizController(whiteViz));
}

class WhiteVizController {
    private whiteViz: WhiteViz;
    private disposable: vscode.Disposable;
    private lastLine: number = undefined;

    constructor(whiteViz: WhiteViz){
        this.whiteViz = whiteViz;

        const subscriptions: vscode.Disposable[] = [];

        vscode.workspace.onDidChangeConfiguration(() => {
            this.whiteViz.updateConfigurations();
        }, this, subscriptions);

        vscode.window.onDidChangeTextEditorSelection((event) => {
            this.whiteViz.updateEditor(event.textEditor);
        });

        vscode.window.onDidChangeTextEditorOptions((event) => {
            this.whiteViz.removeTabIndicator(event.textEditor);
            this.whiteViz.updateEditor(event.textEditor);
        });

        this.disposable = vscode.Disposable.from(...subscriptions);
    }

    dispose(){
        this.disposable.dispose();
    }
}

class WhiteViz {
    private darkColor = "rgba(180, 180, 180, 0.75)";
    private lightColor = "rgba(0, 0, 0, 0.75)";

    private spaceDecoration?: vscode.TextEditorDecorationType;
    private spacePattern = " ";
    private spaceIndicator = "·";
    private spaceMargin = "0 -1ch 0 0";
    private spaceWidth = "1ch"

    // private tabDecoration?: vscode.TextEditorDecorationType;
    private tabDecoration: {
        [filename: string]: vscode.TextEditorDecorationType;
    } = {};

    private tabPattern = "\t";
    private tabIndicator = "→";

    private expandMode = false;
    private visualizeOnlyIndentation = false;
    private skipWordWhitespace = true;
    private overrideDefault = false;
    private disableExtension = false;
    private maximumLimit = 500;

    constructor(){
        this.updateConfigurations();
    }

    dispose(){
        this.reset();
    }

    reset(){
        if (this.spaceDecoration) {
            this.spaceDecoration.dispose();
        }
        for (let key of Object.keys(this.tabDecoration)) {
            this.tabDecoration[key].dispose();
            delete this.tabDecoration[key];
        }
    }

    removeTabIndicator(editor: vscode.TextEditor){
        let key = editor.document.fileName;
        if (this.tabDecoration.hasOwnProperty(key)) {
            editor.setDecorations(this.tabDecoration[key], []);
            this.tabDecoration[key].dispose();

            delete this.tabDecoration[key];
        }
    }

    getTabIndicator(editor: vscode.TextEditor){
        let key = editor.document.fileName;
        if (this.tabDecoration.hasOwnProperty(key)) {
            return this.tabDecoration[key];
        }

        let configurations = vscode.workspace.getConfiguration("whiteviz");
        let decorator: vscode.TextEditorDecorationType;

        if (this.expandMode) {
            let editorConfigurations = vscode.workspace.getConfiguration("editor");

            let tabSize = (
                vscode.window.activeTextEditor &&
                typeof(
                    vscode.window.activeTextEditor.options.tabSize
                ) === "number"
            ) ? vscode.window.activeTextEditor.options.tabSize : parseInt(
                editorConfigurations.get<string>("tabSize")
            );

            let margin = configurations.get<number>("expandedTabMargin");

            decorator = this.createDecoration(
                "—".repeat(tabSize - margin),
                `0 -${ tabSize - (margin / 2) }ch 0 ${ margin / 2 }ch`,
                `${ tabSize - margin }ch`
            );
        } else {
            decorator = this.createDecoration(
                this.tabIndicator,
                "0 0 0 0",
                "0ch"
            );
        }

        this.tabDecoration[key] = decorator;
        return this.tabDecoration[key];
    }

    createDecoration(
        indicator: string,
        margin: string,
        width: string
    ){
        const config = (color: string) => ({
            before: {
                contentText: indicator,
                margin: margin,
                width: width,
                color: color
            }
        });

        return vscode.window.createTextEditorDecorationType({
            light: config(this.lightColor),
            dark: config(this.darkColor)
        });
    }

    updateConfigurations(){
        this.clearDecorations();
        this.reset();

        let configurations = vscode.workspace.getConfiguration("whiteviz");
        this.overrideDefault = configurations.get<boolean>("overrideDefault");
        this.maximumLimit = configurations.get<number>("maximumLimit");

        let editorConfigurations = vscode.workspace.getConfiguration(
            "editor",
            vscode.window.activeTextEditor ?
            vscode.window.activeTextEditor.document.uri : undefined
        );
        let renderWhitespace = editorConfigurations.get<string>(
            "renderWhitespace"
        );

        this.disableExtension = (
            !this.overrideDefault && renderWhitespace !== "none"
        );

        if (this.disableExtension) {
            vscode.window.showInformationMessage(
                `WhiteViz detected that you set "editor.renderWhitespace" to "${
                    renderWhitespace
                }". The extension will now disabled.`
            );
        }

        this.expandMode = configurations.get<boolean>(
            "expandedTabIndicator"
        );
        this.visualizeOnlyIndentation = configurations.get<boolean>(
            "visualizeOnlyIndentation"
        );
        this.skipWordWhitespace = configurations.get<boolean>(
            "skipWordWhitespace"
        );

        this.darkColor = configurations.get<string>(
            "color.dark", configurations.get<string>("color")
        );
        this.lightColor = configurations.get<string>(
            "color.light", configurations.get<string>("color")
        );

        this.spaceIndicator = configurations.get<string>("spaceIndicator");
        this.tabIndicator = configurations.get<string>("tabIndicator");

        this.spacePattern = configurations.get<string>("spacePattern");
        this.tabPattern = configurations.get<string>("tabPattern");

        this.spaceDecoration = this.createDecoration(
            this.spaceIndicator, this.spaceMargin, this.spaceWidth
        );

        if (!this.disableExtension) {
            this.updateDecorations();
        }
    }

    clearDecorations(){
        vscode.window.visibleTextEditors.forEach(this.clearEditor, this);
    }

    clearEditor(editor: vscode.TextEditor){
        if (this.spaceDecoration) {
            editor.setDecorations(this.spaceDecoration, []);
        }
        this.removeTabIndicator(editor);
    }

    updateDecorations(){
        if (!this.spaceDecoration || this.disableExtension) {
            this.clearDecorations();
            return;
        }
        vscode.window.visibleTextEditors.forEach(this.updateEditor, this);
    }

    updateEditor(editor: vscode.TextEditor){
        if (!this.spaceDecoration || this.disableExtension) {
            this.clearEditor(editor);
            return;
        }

        let whitespaceRanges: vscode.Range[] = [];
        let tabRanges: vscode.Range[] = [];

        editor.selections.forEach((selection) => {
            let firstLine = selection.start.line;
            let firstCharacter = selection.start.character;

            let lastLine = selection.end.line;
            let lastCharacter = selection.end.character;

            if (
                this.maximumLimit > 0 &&
                lastLine - firstLine >= this.maximumLimit
            ) {
                return;
            } else if (this.maximumLimit === 0) {
                firstLine = selection.active.line;
                firstCharacter = 0;
                lastLine = selection.active.line;
                lastCharacter = selection.active.character;
            } else if (selection.isEmpty) {
                return;
            }

            for (
                let currentLine = firstLine;
                currentLine <= lastLine;
                currentLine++
            ) {
                const line = editor.document.lineAt(currentLine);
                const lineText = line.text;

                let skipStart: number | undefined;
                let skipEnd: number | undefined;

                if (!line.isEmptyOrWhitespace && this.skipWordWhitespace) {
                    let lineEnding = new RegExp("\\s*$", "g").exec(lineText);
                    if (lineEnding) {
                        skipStart = line.firstNonWhitespaceCharacterIndex;
                        skipEnd = lineEnding.index;
                    }
                }

                let position = (
                    currentLine === firstLine ? firstCharacter : 0
                );

                let lineLength = (
                    currentLine === lastLine ? lastCharacter : lineText.length
                );

                for (; position < lineLength; position++) {
                    if (
                        this.visualizeOnlyIndentation &&
                        position >= line.firstNonWhitespaceCharacterIndex
                    ) {
                        break;
                    }

                    if (
                        skipStart !== undefined && skipEnd !== undefined &&
                        skipStart < position && position < skipEnd
                    ) {
                        continue;
                    }

                    if (
                        this.tabPattern.indexOf(lineText[position]) >= 0
                    ) {
                        tabRanges.push(
                            new vscode.Range(
                                currentLine, position,
                                currentLine, position
                            )
                        );
                    } else if (
                        this.spacePattern.indexOf(lineText[position]) >= 0
                    ) {
                        whitespaceRanges.push(
                            new vscode.Range(
                                currentLine, position,
                                currentLine, position
                            )
                        );
                    }
                }
            }
        });

        editor.setDecorations(this.spaceDecoration, whitespaceRanges);
        editor.setDecorations(this.getTabIndicator(editor), tabRanges);
    }
}
