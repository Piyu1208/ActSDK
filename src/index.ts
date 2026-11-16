import { ActBuilder } from './app/agent.js';
import type { ActAgent } from './app/agent.js';


function init() {
    const agent: ActAgent = new ActBuilder()
    .setInstructions("You are an Agent in making.")
    .build();

    agent.showInstructions();
}

init();
