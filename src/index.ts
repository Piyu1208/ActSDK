import { ActBuilder } from './app/agent.js';
import type { ActAgent } from './app/agent.js';
import { weatherTool, cliAccessTool } from './tools.js';



async function init() {
    const agent: ActAgent = new ActBuilder()
        .setInstructions("You are an AI assitant.")
        .tool(weatherTool)
        .tool(cliAccessTool)
        .build();

    agent.attachInterceptor((msg) => console.log(msg))

    const res = await agent.run('Create an index.html file in my current project with text Hello World?');
    console.log(res);
}

init();
