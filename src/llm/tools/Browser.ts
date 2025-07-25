import { requestUrl } from "obsidian";
import { ToolDefinition } from "types";

export interface BrowserToolResult {
    success: boolean;
    content?: string;
    status?: number;
}

const extractTextContent = (html: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove script and style elements
    const scripts = doc.querySelectorAll('script, style');
    scripts.forEach(el => el.remove());

    // Get text content and clean up whitespace
    return doc.body?.textContent?.replace(/\s+/g, ' ').trim() || '';
};

export const fetchPage = async (url: string, fullHtml: boolean = false): Promise<BrowserToolResult> => {
    try {
        const response = await requestUrl(url);
        const content = fullHtml ? response.text : extractTextContent(response.text);
        return { success: true, content, status: response.status };
    } catch (error) {
        return { success: false, status: 500, content: error.message };
    }
}

export const browserToolDefinition: ToolDefinition = {
    name: 'web_browser',
    description: 'A web browser tool that will fetch a web page and return the content',
    parameters: {
        type: 'object',
        properties: {
            url: {
                type: 'string',
                description: 'The url to the page to view'
            },
            fullHtml: {
                type: 'boolean',
                description: 'Whether to return the full HTML of the page, rather than just the text',
                default: false
            }
        },
        required: ['url']
    }
};
