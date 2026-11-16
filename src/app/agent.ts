import { HARNESS_PROMPT } from './config.js';
import OpenAI from "openai";
import "dotenv/config";

export interface ActTool {
    name: string,
    description: string,
    doc?: string,
    executor: (input: string) => Promise<string>
}

export interface ActMessage {
    role: 'user' | 'assistant' | 'developer' | 'system',
    content: string
}

export class ActBuilder {
    public instructions: string | undefined;
    public toolList: ActTool[];

    constructor() {
        this.toolList = [];
    }

    public tool(newTool: ActTool) {
        this.toolList.push(newTool);
        return this;
    }

    public build() {
        return new ActAgent(this);
    }

    public setInstructions(instructions: string) {
        this.instructions = instructions;
        return this;
    }
}


export class ActAgent {
    private instructions: string;
    private messageHistory: ActMessage[];
    private toolMap: Map<string, ActTool>;
    private openai: OpenAI;

    private MAX_LOOPS = 20;

    constructor(builder: ActBuilder) {
        this.toolMap = new Map();
        this.openai = new OpenAI({
            baseURL: 'https://aicredits.in/v1',
            apiKey: process.env.OPENAI_API_KEY
        })

        for (const t of builder.toolList) {
            this.toolMap.set(t.name, t)
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
        `;

        this.messageHistory = [];
    }

    builder() {
        return new ActBuilder();
    }

    public showInstructions() {
        console.log(this.instructions);
    }

    public async run(query: string) {

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

            // parse LLM Response
            const parsedResponse = JSON.parse(response.output_text);


            // if (parsedResponse.step === "output") :
            //       return history;

            if (parsedResponse.step.toLowerCase() === 'output') {
                return this.messageHistory;
            }

            // if (parsedResponse.step === "tool_request") :
            //    {toolName, input} = parsedResponse;

            //    if (!tool) :
            //       history.push(errmsg)
            //       continue

            //    toolResult = toolName(input);
            //    history.push(toolResult)

            if (parsedResponse.step.toLowerCase() === 'tool_request') {
                const { functionName, input } = parsedResponse;
                const tool = this.toolMap.get(functionName)

                if (!tool) {
                    this.messageHistory.push({
                        role: 'developer',
                        content: `Error: tool with tool name ${tool} does not exist.`
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
                })
            }

        }
    }
}