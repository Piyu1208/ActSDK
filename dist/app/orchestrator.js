import { ORCHESTRATOR_PROMPT } from './config.js';
import OpenAI from 'openai';
import 'dotenv/config';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
export class OrchBuilder {
    instructions;
    agentList;
    constructor() {
        this.agentList = [];
    }
    build() {
        return new Orchestrator(this);
    }
    handoff(agents) {
        this.agentList.push(...agents);
        return this;
    }
}
export class Orchestrator {
    instructions;
    messageHistory;
    agentMap;
    openai;
    MAX_LOOPS = 20;
    interceptors;
    constructor(builder) {
        this.agentMap = new Map();
        this.openai = new OpenAI({
            baseURL: 'https://aicredits.in/v1',
            apiKey: process.env.OPENAI_API_KEY
        });
        for (const a of builder.agentList) {
            this.agentMap.set(a.name, a);
        }
        this.instructions = `
        ${ORCHESTRATOR_PROMPT}\n\n

        Available Agents:
        ${builder.agentList.map(a => JSON.stringify({
            agentName: a.name
        })).join('\n')}
        `;
        this.messageHistory = [];
        this.interceptors = [];
    }
    builder() {
        return new OrchBuilder();
    }
    attachInterceptor(interceptor) {
        this.interceptors.push(interceptor);
    }
    notifyInterceptor(message) {
        for (const interceptor of this.interceptors) {
            interceptor(message);
        }
    }
    async run(query, chatHistory = []) {
        // Working history for this run only. Handoffs and intermediate steps stay here.
        const messages = [
            ...chatHistory,
            { role: 'user', content: query }
        ];
        for (let i = 0; i < this.MAX_LOOPS; i++) {
            const response = await this.openai.responses.create({
                model: 'gpt-4o-mini',
                input: [
                    { role: 'system', content: this.instructions },
                    ...messages.map(e => ({ role: e.role, content: e.content }))
                ]
            });
            const assistantMsg = {
                role: 'assistant',
                content: response.output_text
            };
            messages.push(assistantMsg);
            this.notifyInterceptor(assistantMsg);
            const parsedResponse = JSON.parse(response.output_text);
            if (parsedResponse.step.toLowerCase() === 'output') {
                return assistantMsg;
            }
            if (parsedResponse.step.toLowerCase() === 'handoff') {
                // same as before, but push to `messages` instead of this.messageHistory
                const { agentName, input } = parsedResponse;
                const agent = this.agentMap.get(agentName);
                if (!agent) {
                    messages.push({
                        role: 'developer',
                        content: `Error: agent with name ${agentName} does not exist.`
                    });
                    this.notifyInterceptor({
                        role: 'developer',
                        content: `Error: agent with agent name ${agentName} does not exist.`
                    });
                    continue;
                }
                const agentRes = await agent.run(input);
                messages.push({
                    role: 'developer',
                    content: JSON.stringify({
                        agentName,
                        input,
                        agentRes: agentRes.content
                    })
                });
                this.notifyInterceptor({
                    role: 'developer',
                    content: JSON.stringify({
                        agentName,
                        input,
                        agentRes: JSON.parse(agentRes.content).text
                    })
                });
            }
        }
    }
    async chat() {
        // Only user queries and final agent output (raw JSON)
        const chatHistory = [];
        const rl = readline.createInterface({ input, output });
        console.log("Chat started. Type 'exit' to quit.\n");
        try {
            while (true) {
                const query = (await rl.question('You: ')).trim();
                if (!query)
                    continue;
                if (query.toLowerCase() === 'exit')
                    break;
                try {
                    // run() adds the user query itself, so don't push it beforehand
                    const result = await this.run(query, chatHistory);
                    if (!result) {
                        console.log('Agent: (no final output; max loops reached)\n');
                        continue;
                    }
                    // Display only the text field; fall back to raw content if parsing fails
                    let displayText = result.content;
                    try {
                        const parsed = JSON.parse(result.content);
                        displayText = parsed.text ?? result.content;
                    }
                    catch {
                        // not JSON, use as-is
                    }
                    // Commit the turn only after success, storing the raw JSON
                    chatHistory.push({ role: 'user', content: query });
                    chatHistory.push({ role: 'assistant', content: result.content });
                    console.log(`Agent: ${displayText}\n`);
                }
                catch (err) {
                    console.error('Error:', err instanceof Error ? err.message : err);
                }
            }
        }
        finally {
            rl.close();
        }
        return chatHistory;
    }
}
//# sourceMappingURL=orchestrator.js.map