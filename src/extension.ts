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

        this.visualizeOnlyIndentation = configurations.get<boolean>(
            "visualizeOnlyIndentation"
        );
        let spaceIndicator = configurations.get<string>("spaceIndicator");
        let tabIndicator = configurations.get<string>("tabIndicator");

        let darkColor = configurations.get<string>(
            "color.dark", configurations.get<string>("color")
        );
        let lightColor = configurations.get<string>(
            "color.light", configurations.get<string>("color")
        );

        this.spacePattern = configurations.get<string>(
            "spacePattern"
        );
        this.tabPattern = configurations.get<string>("tabPattern");

        let margin = "0ch -1ch 0ch 0ch";

        this.whitespaceDecoration = (
            vscode.window.createTextEditorDecorationType(
                {
                    light: {
                        before: {
                            contentText: spaceIndicator,
                            margin: margin,
                            color: lightColor
                        }
                    },
                    dark: {
                        before: {
                            contentText: spaceIndicator,
                            margin: margin,
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
                            margin: margin,
                            color: lightColor
                        }
                    },
                    dark: {
                        before: {
                            contentText: tabIndicator,
                            margin: margin,
                            color: darkColor
                        }
                    }
                }
             )
        );

        this.updateDecorations();
    }

    clearDecorations(){
        vscode.window.visibleTextEditors.forEach((editor) => {
            if (this.whitespaceDecoration) {
                editor.setDecorations(this.whitespaceDecoration, []);
            }
        });
    }

    updateDecorations(){
        vscode.window.visibleTextEditors.forEach(this.updateEditor, this);
    }

    updateEditor(editor: vscode.TextEditor){
        if (!this.whitespaceDecoration) {
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
