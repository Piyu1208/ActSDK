import { HARNESS_PROMPT } from './config.js';
import OpenAI from "openai";
import "dotenv/config";
export class ActBuilder {
    instructions;
    toolList;
    agentList;
    constructor() {
        this.toolList = [];
        this.agentList = [];
    }
    tool(newTools) {
        this.toolList.push(...newTools);
        return this;
    }
    handoff(agents) {
        this.agentList.push(...agents);
        return this;
    }
    build(name) {
        return new ActAgent(this, name);
    }
    setInstructions(instructions) {
        this.instructions = instructions;
        return this;
    }
}
export class ActAgent {
    name;
    instructions;
    messageHistory;
    toolMap;
    agentMap;
    openai;
    MAX_LOOPS = 20;
    interceptors;
    constructor(builder, name) {
        this.name = name;
        this.toolMap = new Map();
        this.agentMap = new Map();
        this.openai = new OpenAI({
            baseURL: 'https://aicredits.in/v1',
            apiKey: process.env.OPENAI_API_KEY
        });
        for (const t of builder.toolList) {
            this.toolMap.set(t.name, t);
        }
        for (const a of builder.agentList) {
            this.agentMap.set(a.name, a);
        }
        this.instructions = `
        ${HARNESS_PROMPT}/n/n

        System Prompt:
        ${builder.instructions}/n/n

        Available Tools:
        ${builder.toolList.map(t => JSON.stringify({
            functionName: t.name,
            functionDescritption: t.description,
            functionDoc: t.doc
        })).join('\n')}

        Available Agents: 
        ${builder.agentList.map(a => JSON.stringify({
            agentName: a.name
        })).join('\n')}
        `;
        this.messageHistory = [];
        this.interceptors = [];
    }
    builder() {
        return new ActBuilder();
    }
    showInstructions() {
        console.log(this.instructions);
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
            // LLM Response = LLM Call ( sysPrompt + history )
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
            // append LLM Response to history
            this.messageHistory.push({
                role: 'assistant',
                content: response.output_text
            });
            this.notifyInterceptor({
                role: 'assistant',
                content: response.output_text
            });
            // parse LLM Response
            const parsedResponse = JSON.parse(response.output_text);
            // if (parsedResponse.step === "output") :
            //       return history;
            if (parsedResponse.step.toLowerCase() === 'output') {
                return this.messageHistory[this.messageHistory.length - 1];
            }
            // if (parsedResponse.step === "tool_request") :
            //    {toolName, input} = parsedResponse;
            //    if (!tool) :
            //       history.push(errmsg)
            //       continue
            //    toolResult = toolName(input);
            //    history.push(toolResult)
            if (parsedResponse.step.toLowerCase() === 'handoff') {
                const { agentName, input } = parsedResponse;
                const agent = this.agentMap.get(agentName);
                if (!agent) {
                    this.messageHistory.push({
                        role: 'developer',
                        content: `Error: agent with agent name ${agentName} does not exist.`
                    });
                    this.notifyInterceptor({
                        role: 'developer',
                        content: `Error: agent with agent name ${agentName} does not exist.`
                    });
                    continue;
                }
                const res = await agent.run(input);
                console.log(res);
                return;
            }
            if (parsedResponse.step.toLowerCase() === 'tool_request') {
                const { functionName, input } = parsedResponse;
                const tool = this.toolMap.get(functionName);
                if (!tool) {
                    this.messageHistory.push({
                        role: 'developer',
                        content: `Error: tool with tool name ${functionName} does not exist.`
                    });
                    this.notifyInterceptor({
                        role: 'developer',
                        content: `Error: tool with tool name ${functionName} does not exist.`
                    });
                    continue;
                }
                const toolResult = await tool.executor(input);
                this.messageHistory.push({
                    role: 'developer',
                    content: JSON.stringify({
                        functionName,
                        input,
                        toolResult
                    })
                });
                this.notifyInterceptor({
                    role: 'developer',
                    content: JSON.stringify({
                        functionName,
                        input,
                        toolResult
                    })
                });
            }
        }
    }
}
//# sourceMappingURL=agent.js.map