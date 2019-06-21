import {
	ContentState,
	convertFromRaw,
	convertToRaw,
	DraftEditorCommand,
	DraftHandleValue,
	Editor as DraftJsEditor,
	EditorState,
	getDefaultKeyBinding,
	RichUtils,
} from "draft-js";
import createAutoListPlugin from "draft-js-autolist-plugin";
import PluginEditor from "draft-js-plugins-editor";
import "draft-js/dist/Draft.css";
import debounce from "lodash.debounce";
import { draftToMarkdown, markdownToDraft } from "markdown-draft-js";
import React, { KeyboardEvent, PureComponent, ReactNode } from "react";

import { toIndexDate, toLocaleWeekday } from "../../../utils/dateFormat";
import { translations } from "../../../utils/i18n";
import EditorToolbar from "./EditorToolbar";

type DraftEditorCommandExtended = DraftEditorCommand | "enter";

const AUTOSAVE_INTERVAL = 500;

const plugins = [createAutoListPlugin()];

export interface StateProps {
	dateSelected: Date;
	entries: Entries;
}

export interface DispatchProps {
	updateEntry: (entryDate: IndexDate, title: string, text: string) => void;
}

type Props = StateProps & DispatchProps;

interface State {
	dateSelected: Date;
	textEditorState: EditorState;
	titleEditorState: EditorState;
}

export default class Editor extends PureComponent<Props, State> {
	static getDerivedStateFromProps(props: Props, state: State): State | null {
		const { dateSelected: dateProps, entries } = props;
		const { dateSelected: dateState } = state;

		if (dateProps === dateState) {
			return null;
		}
		const entryState = Editor.getStateFromEntry(entries, dateProps);
		return {
			...entryState,
			dateSelected: dateProps,
		};
	}

	static getStateFromEntry(
		entries: Entries,
		date: Date,
	): { textEditorState: EditorState; titleEditorState: EditorState } {
		const indexDate = toIndexDate(date);
		const entry = entries[indexDate];
		let text = "";
		let title = "";
		if (entry) {
			({ text, title } = entry);
		}

		return {
			textEditorState: EditorState.createWithContent(convertFromRaw(markdownToDraft(text))),
			titleEditorState: EditorState.createWithContent(ContentState.createFromText(title)),
		};
	}

	static titleKeyBindingFn(e: KeyboardEvent): DraftEditorCommandExtended | null {
		if (e.key === "Enter") {
			return "enter";
		}
		return getDefaultKeyBinding(e);
	}

	saveEntryDebounced: () => void;

	textEditor: DraftJsEditor;

	constructor(props: Props) {
		super(props);
		const { dateSelected, entries } = props;

		const entryState = Editor.getStateFromEntry(entries, dateSelected);
		this.state = {
			...entryState,
			dateSelected,
		};

		// Function bindings
		this.handleTextKeyCommand = this.handleTextKeyCommand.bind(this);
		this.handleTitleKeyCommand = this.handleTitleKeyCommand.bind(this);
		this.onTextChange = this.onTextChange.bind(this);
		this.onTitleChange = this.onTitleChange.bind(this);
		this.saveEntry = this.saveEntry.bind(this);
		this.saveEntryDebounced = debounce(this.saveEntry.bind(this), AUTOSAVE_INTERVAL);

		// Save entry before app is closed
		window.addEventListener("unload", (): void => {
			this.saveEntry();
		});
	}

	onTextChange(textEditorState: EditorState): void {
		this.setState({
			textEditorState,
		});
		this.saveEntryDebounced();
	}

	onTitleChange(titleEditorState: EditorState): void {
		this.setState({
			titleEditorState,
		});
		this.saveEntryDebounced();
	}

	handleTextKeyCommand(command: DraftEditorCommand, editorState: EditorState): DraftHandleValue {
		let newState: EditorState;
		if (command === "bold") {
			newState = RichUtils.toggleInlineStyle(editorState, "BOLD");
		} else if (command === "italic") {
			newState = RichUtils.toggleInlineStyle(editorState, "ITALIC");
		} else {
			return "not-handled";
		}
		this.onTextChange(newState);
		return "handled";
	}

	handleTitleKeyCommand(command: DraftEditorCommandExtended): DraftHandleValue {
		// Move focus to text editor when enter key is pressed in title editor
		if (command === "enter") {
			this.textEditor.focus();
			return "handled";
		}
		return "not-handled";
	}

	saveEntry(): void {
		const { dateSelected, updateEntry } = this.props;
		const { textEditorState, titleEditorState } = this.state;

		const indexDate = toIndexDate(dateSelected);
		const title = titleEditorState.getCurrentContent().getPlainText();
		const text = draftToMarkdown(convertToRaw(textEditorState.getCurrentContent()));
		updateEntry(indexDate, title.trim(), text.trim());
	}

	render(): ReactNode {
		const { dateSelected, textEditorState, titleEditorState } = this.state;

		// Detect active inline/block styles
		const blockType = RichUtils.getCurrentBlockType(textEditorState);
		const isOl = blockType === "ordered-list-item";
		const isUl = blockType === "unordered-list-item";

		const weekdayDate = toLocaleWeekday(dateSelected);
		return (
			<form className="editor">
				<div className="editor-scrollable">
					<p className="text-faded">{weekdayDate}</p>
					<div className="editor-title-wrapper">
						<DraftJsEditor
							editorState={titleEditorState}
							handleKeyCommand={this.handleTitleKeyCommand}
							keyBindingFn={Editor.titleKeyBindingFn}
							onBlur={this.saveEntry}
							onChange={this.onTitleChange}
							placeholder={translations["add-a-title"]}
						/>
					</div>
					<div className="editor-text-wrapper">
						<PluginEditor
							editorState={textEditorState}
							handleKeyCommand={this.handleTextKeyCommand}
							onBlur={this.saveEntry}
							onChange={this.onTextChange}
							ref={(textEditor: DraftJsEditor): void => {
								this.textEditor = textEditor;
							}}
							placeholder={isOl || isUl ? "" : `${translations["write-something"]}…`}
							plugins={plugins}
						/>
					</div>
				</div>
				<EditorToolbar onTextChange={this.onTextChange} textEditorState={textEditorState} />
			</form>
		);
	}
}
