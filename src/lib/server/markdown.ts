import showdown from 'showdown';

// Call only with repository-owned Markdown, since embedded HTML is preserved.
export function renderMarkdown(markdown: string) {
	return new showdown.Converter({
		tables: true,
		noHeaderId: true,
		headerLevelStart: 2
	}).makeHtml(markdown);
}
