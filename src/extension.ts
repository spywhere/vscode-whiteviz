"use strict";
import * as vscode from "vscode";

export function activate(context: vscode.ExtensionContext) {
    const whiteSpace = new WhiteSpace();
    context.subscriptions.push(whiteSpace);
    context.subscriptions.push(new WhiteSpaceController(whiteSpace));
}

class WhiteSpaceController {
    private whiteSpace: WhiteSpace;
    private disposable: vscode.Disposable;
    private lastLine: number = undefined;

    constructor(whiteSpace: WhiteSpace){
        this.whiteSpace = whiteSpace;

        const subscriptions: vscode.Disposable[] = [];

        vscode.workspace.onDidChangeConfiguration(this.whiteSpace.updateConfigurations, this, subscriptions);

        vscode.window.onDidChangeTextEditorSelection(event => {
            this.whiteSpace.updateEditor(event.textEditor);
        });

        this.disposable = vscode.Disposable.from(...subscriptions);
    }

    dispose(){
        this.disposable.dispose();
    }
}

class WhiteSpace {
    private editorTabSize = -1; // tbd

    private spaceDecoration?: vscode.TextEditorDecorationType;
    private spacePattern = /[ ]|\u00A0|\u2000|\u2001|\u2002|\u2003|\u2004|\u2005|\u2006|\u2007|\u2008|\u2009|\u200A|\u202F|\u205F|\u3000|\u200B|\u200C|\u200D|\u2060/;
    private spaceIndicator = "·";
    private spaceMargin = "0 -1ch 0 0";
    private spaceWidth = "1ch"

    private tabDecoration?: vscode.TextEditorDecorationType;
    private tabPattern = /\t/;
    private tabIndicator = ""; // tbd later based on tabSize
    private tabMargin = ""; // tbd later based on tabSize

    private tabWidth = ""

    private overrideDefault = false;
    private disableExtension = false;

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

    updateConfigurations() {
        this.clearDecorations();
        let configurations = vscode.workspace.getConfiguration("whiteviz");

        let editorConfig = vscode.workspace.getConfiguration("editor");
        let renderWhitespace = editorConfig.get("renderWhitespace");
        this.disableExtension = !this.overrideDefault && renderWhitespace !== "none";
        if (this.disableExtension) {
            vscode.window.showInformationMessage(`WhiteSpace detected that you set "editor.renderWhitespace" to "${renderWhitespace}". The extension will now disabled.`);
        }
        this.editorTabSize = parseInt(editorConfig.get<string>("tabSize"));
        this.tabMargin = `0 -${this.editorTabSize}ch 0 0`;
        this.tabWidth = `${this.editorTabSize}ch`;
        this.tabIndicator = this.editorTabSize % 4 === 0
            ? "⸻".repeat(this.editorTabSize / 4)
            : this.editorTabSize % 2 === 0
                ? "⸺"
                : "—";

        const darkColor = configurations.get("color.dark", configurations.get("color"));
        const lightColor = configurations.get("color.light", configurations.get("color"));
        const emDashFont = "'Source Sans Pro'";

        const config = color => type => ({
            before: {
                contentText: this[`${type}Indicator`],
                margin: this[`${type}Margin`],
                width: this[`${type}Width`],
                color: color,
                textDecoration: `none; font-family: ${emDashFont}; text-align: center`
            }
        })

        const [lightConfig, darkConfig] = [config(lightColor), config(darkColor)];

        ["space", "tab"].forEach(t => {
            this[`${t}Decoration`] = vscode.window.createTextEditorDecorationType({
                light: lightConfig(t),
                dark: darkConfig(t)
            });
        });
        if (!this.disableExtension)
            this.updateDecorations();
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

        editor.selections.forEach(selection => {
            if (selection.isEmpty)
                return;

            const selectionFirstLine = selection.start.line;
            const selectionLastLine = selection.end.line;

            const selectionFirstChar = selection.start.character;
            const selectionLastChar = selection.end.character;

            let currentLineNum = selectionFirstLine;

            for (; currentLineNum <= selectionLastLine; currentLineNum++) {
                const line = editor.document.lineAt(currentLineNum);

                let charNum = currentLineNum === selectionFirstLine
                    ? selectionFirstChar
                    : 0;

                let lineLength = currentLineNum === selectionLastLine
                    ? selectionLastChar
                    : line.text.length;

                for (; charNum < lineLength; charNum++) {
                    if (this.tabPattern.test(line.text[charNum]))
                        tabRanges.push(
                            new vscode.Range(currentLineNum, charNum, currentLineNum, charNum)
                        );

                    else if (this.spacePattern.test(line.text[charNum]))
                        whitespaceRanges.push(
                            new vscode.Range(currentLineNum, charNum, currentLineNum, charNum)
                        );
                }
            }
        });

        editor.setDecorations(this.spaceDecoration, whitespaceRanges);
        editor.setDecorations(this.tabDecoration, tabRanges);
    }
}
