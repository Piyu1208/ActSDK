import "dotenv/config";
import axios from 'axios';
import { exec } from 'node:child_process';
import readline from 'node:readline/promises';
import { tavily } from "@tavily/core";
// --------------------------------------- Weather Tool ------------------------------------------------------
const WEATHER_CODES = {
    0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast',
    45: 'Fog', 48: 'Rime fog',
    51: 'Light drizzle', 53: 'Moderate drizzle', 55: 'Dense drizzle',
    56: 'Light freezing drizzle', 57: 'Dense freezing drizzle',
    61: 'Slight rain', 63: 'Moderate rain', 65: 'Heavy rain',
    66: 'Light freezing rain', 67: 'Heavy freezing rain',
    71: 'Slight snow', 73: 'Moderate snow', 75: 'Heavy snow', 77: 'Snow grains',
    80: 'Slight rain showers', 81: 'Moderate rain showers', 82: 'Violent rain showers',
    85: 'Slight snow showers', 86: 'Heavy snow showers',
    95: 'Thunderstorm', 96: 'Thunderstorm with slight hail', 99: 'Thunderstorm with heavy hail',
};
const http = axios.create({ timeout: 8000 });
export const weatherTool = {
    name: 'fetchWeather',
    description: 'fetches realtime weather data',
    doc: 'fetchWeather(cityName: string): Real time response',
    async executor(input) {
        const city = input.trim();
        if (!city)
            return 'Error: no city name provided.';
        try {
            const { data: geo } = await http.get('https://geocoding-api.open-meteo.com/v1/search', { params: { name: city, count: 1, language: 'en', format: 'json' } });
            const place = geo.results?.[0];
            if (!place)
                return `Error: could not find a city named "${city}".`;
            const { data: wx } = await http.get('https://api.open-meteo.com/v1/forecast', {
                params: {
                    latitude: place.latitude,
                    longitude: place.longitude,
                    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m',
                    timezone: 'auto',
                },
            });
            const { current: c, current_units: u } = wx;
            const condition = WEATHER_CODES[c.weather_code] ?? 'Unknown conditions';
            const location = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
            return `Weather in ${location}: ${condition}, ${c.temperature_2m}${u.temperature_2m} ` +
                `(feels like ${c.apparent_temperature}${u.apparent_temperature}), ` +
                `humidity ${c.relative_humidity_2m}${u.relative_humidity_2m}, ` +
                `wind ${c.wind_speed_10m} ${u.wind_speed_10m}.`;
        }
        catch (err) {
            const reason = axios.isAxiosError(err)
                ? err.response ? `HTTP ${err.response.status}` : err.message
                : err instanceof Error ? err.message : String(err);
            return `Error: failed to fetch weather for "${city}": ${reason}`;
        }
    },
};
// -------------------------------------------------------------------------------------------------------------------
// ---------------------------------------- Run Command Tool ---------------------------------------------------------
const CLI_TIMEOUT_MS = 30_000;
const MAX_OUTPUT_CHARS = 10_000;
const REQUIRE_APPROVAL = true; // set to false ONLY inside a sandbox (Docker/VM)
async function askApproval(cmd) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    try {
        const ans = await rl.question(`\nAgent wants to run:\n  $ ${cmd}\nAllow? [y/N] `);
        return ans.trim().toLowerCase() === 'y';
    }
    finally {
        rl.close();
    }
}
// Keep the start and the end of long output; errors are usually at the end
function truncate(s) {
    if (s.length <= MAX_OUTPUT_CHARS)
        return s;
    const head = Math.floor(MAX_OUTPUT_CHARS * 0.4);
    const tail = MAX_OUTPUT_CHARS - head;
    return `${s.slice(0, head)}\n...[${s.length - MAX_OUTPUT_CHARS} chars omitted]...\n${s.slice(-tail)}`;
}
export const cliAccessTool = {
    name: 'execCli',
    description: `Runs a CLI command on the user's machine (${process.platform}) and returns exit code, stdout and stderr. ` +
        `Commands time out after ${CLI_TIMEOUT_MS / 1000}s and cannot read stdin, so use non-interactive flags (e.g. -y). ` +
        `Each call starts in the same directory, so use full paths or chain commands like "cd dir && cmd".`,
    doc: 'execCli(cli: string): CLIResponse',
    async executor(cmd) {
        const command = cmd.trim();
        if (!command)
            return 'There was an Error: no command provided.';
        if (REQUIRE_APPROVAL && !(await askApproval(command))) {
            return 'The user rejected this command. Do not retry it; ask what they would like instead.';
        }
        return new Promise((res) => {
            const child = exec(command, { timeout: CLI_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
                const body = `stdout:\n${truncate(stdout.trim()) || '(empty)'}\n` +
                    `stderr:\n${truncate(stderr.trim()) || '(empty)'}`;
                if (!err)
                    return res(`exit code: 0\n${body}`);
                const e = err;
                if (e.killed) {
                    return res(`There was an Error: command timed out after ${CLI_TIMEOUT_MS / 1000}s and was killed.\n${body}`);
                }
                if (e.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
                    return res(`There was an Error: command produced too much output.\n${body}`);
                }
                // Non-zero exit: still return the output so the agent can react
                res(`exit code: ${e.code ?? 'unknown'}\n${body}`);
            });
            // Prompts like `npm init` fail fast instead of hanging until the timeout
            child.stdin?.end();
        });
    },
};
// ---------------------------------------------------------------------------------------------------------------------------------
// ------------------------------ Web Search Tool ------------------------------------------------------------------------------------
export const webSearchTool = {
    name: 'webSearch',
    description: 'Searches the web and fetches results.',
    doc: 'webSearch(input: string): Response',
    async executor(query) {
        const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
        const response = await tvly.search(query);
        return JSON.stringify(response);
    }
};
//# sourceMappingURL=tools.js.map