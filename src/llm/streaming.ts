import { requestUrl } from "obsidian";

export interface HttpConfig {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: any;
}

export async function* streamResponse(response: Response): AsyncGenerator<string, void, unknown> {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        if (!reader) {
            throw new Error('Response body is not readable');
        }

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim() === '') continue;
                yield line;
            }
        }
    } finally {
        reader?.releaseLock();
    }
}

/**
 * Make HTTP request and return response
 */
export async function* callRequestUrl(config: HttpConfig): AsyncGenerator<string, void, unknown> {
    const response = await requestUrl({
        url: config.url,
        method: config.method || 'GET',
        headers: config.headers || {},
        body: config.body ? JSON.stringify(config.body) : undefined,
        throw: false
    });

    if (response.status >= 400) {
        const errorText = response.text;
        console.error(errorText, response.status);
        throw new Error(`Request failed: ${response.status} - ${errorText}`);
    }

    for (const chunk of response.text.split('\n')) {
        if (chunk.trim() === '') continue;
        yield chunk;
    }
}

async function* streamNodeRequest(config: HttpConfig): AsyncGenerator<string, void, unknown> {
    const url = new URL(config.url);
    const isHttps = url.protocol === 'https:';
    const httpModule = isHttps ? require('https') : require('http');

    const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: config.method || 'GET',
        headers: config.headers || {}
    };

    const generator = await new Promise<AsyncGenerator<string, void, unknown>>((resolve, reject) => {
        const req = httpModule.request(options, (res: any) => {
            if (res.statusCode >= 400) {
                // Collect the error response body
                let errorBody = '';
                res.on('data', (chunk: any) => {
                    errorBody += chunk.toString();
                });
                res.on('end', () => {
                    console.error('Request failed:', {
                        statusCode: res.statusCode,
                        statusMessage: res.statusMessage,
                        headers: res.headers,
                        body: errorBody
                    });
                    reject(new Error(`Request failed: ${res.statusCode} - ${res.statusMessage}. Body: ${errorBody}`));
                });
                return;
            }

            const generator = async function* () {
                let buffer = '';

                for await (const chunk of res) {
                    buffer += chunk.toString();
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        yield line;
                    }
                }
            };

            resolve(generator());
        });

        req.on('error', reject);

        if (config.body) {
            req.write(JSON.stringify(config.body));
        }

        req.end();
    });

    yield* generator;
}


export async function* callEndpoint(config: HttpConfig): AsyncGenerator<string, void, unknown> {
    // Check if we're in a test environment and force requestUrl path
    const isTestEnv = process.env.NODE_ENV === 'test';

    if (!isTestEnv && typeof require !== 'undefined' && require('https')) {
        yield* streamNodeRequest(config);
    } else {
        yield* callRequestUrl(config);
    }
}


/**
 * Stream JSON objects from a response
 * Extracts JSON from any line that contains valid JSON
 */
export async function* streamJsonObjects(data: AsyncGenerator<string, void, unknown>): AsyncGenerator<any, void, unknown> {
    for await (const line of data) {
        if (line.trim() === '') continue;

        if (line.trim().startsWith(': ping')) {
            yield { type: 'ping', content: line.trim() };
            continue;
        }

        // Try to find JSON in the line
        const jsonMatch = line.match(/\{.*\}/);
        if (jsonMatch) {
            try {
                const parsed = JSON.parse(jsonMatch[0]);
                yield parsed;
            } catch (e) {
                // Skip invalid JSON
            }
        }
    }
}

/**
 * Call endpoint and stream JSON objects
 */
export async function* streamFromEndpoint(config: HttpConfig): AsyncGenerator<any, void, unknown> {
    const response = callEndpoint(config);
    yield* streamJsonObjects(response);
} 