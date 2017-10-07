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

        this.disposable = vscode.Disposable.from(...subscriptions);
    }

    dispose(){
        this.disposable.dispose();
    }
}

class WhiteViz {
    private spaceDecoration?: vscode.TextEditorDecorationType;
    private spacePattern = " ";
    private spaceIndicator = "·";
    private spaceMargin = "0 -1ch 0 0";
    private spaceWidth = "1ch"

    private tabDecoration?: vscode.TextEditorDecorationType;
    private tabPattern = "\t";
    private tabIndicator = "→";
    private tabMargin = "";
    private tabWidth = "";

    private visualizeOnlyIndentation = false;
    private overrideDefault = false;
    private disableExtension = false;
    private maximumLimit = 500;

    constructor(){
        this.updateConfigurations();
    }

    dispose(){
        if (this.spaceDecoration) {
            this.spaceDecoration.dispose();
        }
        if (this.tabDecoration) {
            this.tabDecoration.dispose();
        }
    }

    updateConfigurations(){
        this.clearDecorations();

        let configurations = vscode.workspace.getConfiguration("whiteviz");
        this.overrideDefault = configurations.get<boolean>("overrideDefault");
        this.maximumLimit = configurations.get<number>("maximumLimit");

        let editorConfigurations = vscode.workspace.getConfiguration("editor");
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

        let expandedTabIndicator = configurations.get<boolean>(
            "expandedTabIndicator"
        );
        this.visualizeOnlyIndentation = configurations.get<boolean>(
            "visualizeOnlyIndentation"
        );
        this.spaceIndicator = configurations.get<string>("spaceIndicator");
        this.tabIndicator = configurations.get<string>("tabIndicator");

        if (expandedTabIndicator) {
            let tabSize = parseInt(
                editorConfigurations.get<string>("tabSize")
            );
            this.tabMargin = `0 -${ tabSize }ch 0 0`;
            this.tabWidth = `${ tabSize }ch`;
            this.tabIndicator = "—".repeat(tabSize);
        }

        const darkColor = configurations.get<string>(
            "color.dark", configurations.get<string>("color")
        );
        const lightColor = configurations.get<string>(
            "color.light", configurations.get<string>("color")
        );

        this.spacePattern = configurations.get<string>("spacePattern");
        this.tabPattern = configurations.get<string>("tabPattern");

        const config = (color) => (type) => ({
            before: {
                contentText: this[`${type}Indicator`],
                margin: (
                    expandedTabIndicator ?
                    this[`${type}Margin`] : this.spaceMargin
                ),
                width: (
                    expandedTabIndicator ?
                    this[`${type}Width`] :
                    this.spaceWidth
                ),
                color: color
            }
        })

        const [lightConfig, darkConfig] = [config(lightColor), config(darkColor)];

        ["space", "tab"].forEach(t => {
            this[`${t}Decoration`] = vscode.window.createTextEditorDecorationType({
                light: lightConfig(t),
                dark: darkConfig(t)
            });
        });
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
        if (this.tabDecoration) {
            editor.setDecorations(this.tabDecoration, []);
        }
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
                lastLine - firstLine > this.maximumLimit
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
        editor.setDecorations(this.tabDecoration, tabRanges);
    }
}
