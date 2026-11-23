import { ActBuilder } from './app/agent.js';
import { OrchBuilder } from './app/orchestrator.js';
import { weatherTool, cliAccessTool, webSearchTool } from './tools.js';
import { fileTools } from './fileTools.js';
async function init() {
    const codingAgent = new ActBuilder()
        .setInstructions('You are a coding agent.')
        .tool(fileTools)
        .build('codingAgent');
    codingAgent.attachInterceptor((msg) => console.log(`Coding Agent...`));
    const weatherAgent = new ActBuilder()
        .setInstructions("You are a realtime weather fetching agent.")
        .tool([weatherTool])
        .build('weatherAgent');
    weatherAgent.attachInterceptor((msg) => console.log(msg));
    const researchAgent = new ActBuilder()
        .setInstructions("You are a research agent.")
        .tool([webSearchTool])
        .build('researchAgent');
    researchAgent.attachInterceptor((msg) => console.log(msg));
    const orchestrator = new OrchBuilder()
        .handoff([codingAgent, weatherAgent, researchAgent])
        .build();
    orchestrator.attachInterceptor((msg) => console.log(msg));
    await orchestrator.chat();
}
init();
//# sourceMappingURL=index.js.map