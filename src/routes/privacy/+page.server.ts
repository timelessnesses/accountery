import markdown from '../../../static/privacy-markdown/v1.md?raw';
import { renderMarkdown } from '$lib/server/markdown';

const html = renderMarkdown(markdown);

export const prerender = true;

export const load = () => ({ html });
