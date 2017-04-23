"use strict";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
    let whiteViz = new WhiteViz();
    context.subscriptions.push(whiteViz);
    context.subscriptions.push(new WhiteVizController(whiteViz));
}

class WhiteVizController {
    private whiteViz: WhiteViz;
    private disposable: vscode.Disposable;
    private lastLine: number = undefined;

    constructor(whiteViz: WhiteViz){
        this.whiteViz = whiteViz;

        let subscriptions: vscode.Disposable[] = [];
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
    private whitespaceDecoration?: vscode.TextEditorDecorationType;
    private tabDecoration?: vscode.TextEditorDecorationType;
    private spacePattern = " ";
    private tabPattern = "\t";
    private visualizeOnlyIndentation = false;
    private overrideDefault = false;
    private disableExtension = false;

    constructor(){
        this.updateConfigurations();
    }

    dispose(){
        if (this.whitespaceDecoration) {
            this.whitespaceDecoration.dispose();
        }
        if (this.tabDecoration) {
            this.tabDecoration.dispose();
        }
    }

    updateConfigurations(){
        this.clearDecorations();
 
        let configurations = vscode.workspace.getConfiguration("whiteviz");
        this.overrideDefault = configurations.get<boolean>("overrideDefault");

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

        this.visualizeOnlyIndentation = configurations.get<boolean>(
            "visualizeOnlyIndentation"
        );

        const editorTabSize = parseInt(editorConfigurations.get<string>("tabSize"));

        const spaceIndicator = configurations.get<string>("spaceIndicator");
        const tabIndicator = editorTabSize % 4 === 0 ?
            "⸻".repeat(editorTabSize/4)
            : editorTabSize % 2 === 0
                ? "⸺"
                : "—"; //;

        const darkColor = configurations.get<string>(
            "color.dark", configurations.get<string>("color")
        );
        const lightColor = configurations.get<string>(
            "color.light", configurations.get<string>("color")
        );

        this.spacePattern = configurations.get<string>(
            "spacePattern"
        );
        this.tabPattern = configurations.get<string>("tabPattern");

        const spaceMargin = "0 -1ch 0 0";
        const tabMargin = `0 -${editorTabSize}ch 0 0`;

        this.whitespaceDecoration = (
            vscode.window.createTextEditorDecorationType(
                {
                    light: {
                        before: {
                            contentText: spaceIndicator,
                            margin: spaceMargin,
                            color: lightColor
                        }
                    },
                    dark: {
                        before: {
                            contentText: spaceIndicator,
                            margin: spaceMargin,
                            color: darkColor
                        }
                    }
                }
             )
        );
        this.tabDecoration = (
            vscode.window.createTextEditorDecorationType(
                {
                    light: {
                        before: {
                            contentText: tabIndicator,
                            margin: tabMargin,
                            color: lightColor
                        }
                    },
                    dark: {
                        before: {
                            contentText: tabIndicator,
                            margin: tabMargin,
                            color: darkColor
                        }
                    }
                }
             )
        );

        if (!this.disableExtension) {
            this.updateDecorations();
        }
    }

    clearDecorations(){
        vscode.window.visibleTextEditors.forEach(this.clearEditor, this);
    }

    clearEditor(editor: vscode.TextEditor){
        if (this.whitespaceDecoration) {
            editor.setDecorations(this.whitespaceDecoration, []);
        }
        if (this.tabDecoration) {
            editor.setDecorations(this.tabDecoration, []);
        }
    }

    updateDecorations(){
        if (!this.whitespaceDecoration || this.disableExtension) {
            this.clearDecorations();
            return;
        }
        vscode.window.visibleTextEditors.forEach(this.updateEditor, this);
    }

    updateEditor(editor: vscode.TextEditor){
        if (!this.whitespaceDecoration || this.disableExtension) {
            this.clearEditor(editor);
            return;
        }
        let whitespaceRanges: vscode.Range[] = [];
        let tabRanges: vscode.Range[] = [];
        editor.selections.forEach((selection) => {
            if (selection.isEmpty) {
                return;
            }

            let firstLine = selection.start.line;
            let firstCharacter = selection.start.character;
            let lastLine = selection.end.line;
            let lastCharacter = selection.end.character;
            let currentLine = firstLine;
            while (currentLine <= lastLine) {
                let line = editor.document.lineAt(currentLine);

                let character = (
                    currentLine === firstLine ? firstCharacter : 0
                );
                let lineText = line.text;
                let lineLength = (
                    currentLine === lastLine ? lastCharacter : lineText.length
                );
                while (character < lineLength) {
                    if (
                        this.visualizeOnlyIndentation &&
                        character >= line.firstNonWhitespaceCharacterIndex
                    ) {
                        break;
                    }

                    if (
                        this.tabPattern.indexOf(lineText[character]) >= 0
                    ) {
                        tabRanges.push(new vscode.Range(
                            currentLine, character, currentLine, character
                        ));
                    } else if (
                        this.spacePattern.indexOf(lineText[character]) >= 0
                    ) {
                        whitespaceRanges.push(new vscode.Range(
                            currentLine, character, currentLine, character
                        ));
                    }

                    character += 1;
                }

                currentLine += 1;
            }
        });

        editor.setDecorations(this.whitespaceDecoration, whitespaceRanges);
        editor.setDecorations(this.tabDecoration, tabRanges);
    }
}
