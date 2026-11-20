import { ORCHESTRATOR_PROMPT } from './config.js';
import OpenAI from 'openai';
import 'dotenv/config';
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
        ${ORCHESTRATOR_PROMPT}/n/n

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
    async run(query) {
        // append user query to history
        this.messageHistory.push({
            role: 'user',
            content: query
        });
        for (let i = 0; i < this.MAX_LOOPS; i++) {
            // LLM response = LLM Call ( sysPrompt + history )
            const response = await this.openai.responses.create({
                model: 'gpt-4o-mini',
                input: [
                    {
                        role: 'system',
                        content: this.instructions
                    },
                    ...this.messageHistory.map(e => ({
                        role: e.role,
                        content: e.content
                    }))
                ]
            });
            // append LLM response to history
            this.messageHistory.push({
                role: 'assistant',
                content: response.output_text
            });
            this.notifyInterceptor({
                role: 'assistant',
                content: response.output_text
            });
            // parse LLM response
            const parsedResponse = JSON.parse(response.output_text);
            // if (parsedResponse.step === "output"):
            //     return history
            if (parsedResponse.step.toLowerCase() === 'output') {
                return this.messageHistory[this.messageHistory.length - 1];
            }
            // if (parsedResponse.step === 'handoff'):
            //    {agentName, input} = parsedResponse;
            //  if (!agent):
            //    history.push(errmsg)
            //    continue
            //  handoff_result = agentName(input);
            //  history.push(handOff_result)
            if (parsedResponse.step.toLowerCase() === 'handoff') {
                const { agentName, input } = parsedResponse;
                const agent = this.agentMap.get(agentName);
                if (!agent) {
                    this.messageHistory.push({
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
                this.messageHistory.push({
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
}
//# sourceMappingURL=orchestrator.js.map