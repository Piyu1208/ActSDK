import { ActBuilder } from './app/agent.js';
function init() {
    const agent = new ActBuilder()
        .setInstructions("You are an Agent in making.")
        .build();
    agent.showInstructions();
}
init();
//# sourceMappingURL=index.js.map