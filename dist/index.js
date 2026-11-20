import { ActBuilder } from './app/agent.js';
import { OrchBuilder } from './app/orchestrator.js';
import { weatherTool, cliAccessTool, webSearchTool } from './tools.js';
async function init() {
    const codingAgent = new ActBuilder()
        .setInstructions('You are a coding agent.')
        .tool(cliAccessTool)
        .build('codingAgent');
    codingAgent.attachInterceptor((msg) => console.log(msg));
    const weatherAgent = new ActBuilder()
        .setInstructions("You are a realtime weather fetching agent.")
        .tool(weatherTool)
        .build('weatherAgent');
    weatherAgent.attachInterceptor((msg) => console.log(msg));
    const researchAgent = new ActBuilder()
        .setInstructions("You are a research agent.")
        .tool(webSearchTool)
        .build('researchAgent');
    researchAgent.attachInterceptor((msg) => console.log(msg));
    const orchestrator = new OrchBuilder()
        .handoff([codingAgent, weatherAgent, researchAgent])
        .build();
    orchestrator.attachInterceptor((msg) => console.log(msg));
    const res = await orchestrator.run(`Hey what's the current weather of Kota like? Create a .txt file in my current folder displaying this information.`);
    console.log(res);
}
init();
//# sourceMappingURL=index.js.map