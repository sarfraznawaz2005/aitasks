import { Command } from 'commander';
import chalk from 'chalk';
import { requireInitialized } from '../db/index.js';
import { listAgents, heartbeat, getTask } from '../models/task.js';
import { timeAgo } from '../utils/format.js';
import { jsonOut, isJsonMode, requireAgentId } from './shared.js';

export const agentsCommand = new Command('agents')
  .description('Show active agents and their current work')
  .option('--json', 'Output as JSON')
  .action((opts: { json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);

    const agents = listAgents();

    if (json) return jsonOut(true, agents);

    console.log('');
    if (agents.length === 0) {
      console.log(chalk.dim('  No agents registered yet.'));
      console.log('');
      return;
    }

    console.log(chalk.bold.dim('  AGENT ID                       LAST SEEN       CURRENT TASK'));
    console.log(chalk.dim('  ' + '─'.repeat(70)));

    for (const agent of agents) {
      const lastSeen = timeAgo(agent.last_seen);
      const currentTask = agent.current_task
        ? chalk.cyan(agent.current_task)
        : chalk.dim('—');

      // Stale if not seen in 30 mins
      const stale = Date.now() - agent.last_seen > 30 * 60 * 1000;
      const agentLabel = stale
        ? chalk.dim(agent.id)
        : chalk.bold(agent.id);

      console.log(
        `  ${agentLabel.padEnd(30)}  ${chalk.dim(lastSeen).padEnd(16)}  ${currentTask}`
      );

      if (agent.current_task) {
        const task = getTask(agent.current_task);
        if (task) {
          console.log(chalk.dim(`    └─ ${task.title}`));
        }
      }
    }
    console.log('');
  });

export const heartbeatCommand = new Command('heartbeat')
  .description('Update agent last-seen timestamp (keep-alive)')
  .argument('[taskId]', 'Current task ID being worked on')
  .option('--agent <agentId>', 'Agent ID (or set AITASKS_AGENT_ID)')
  .option('--json', 'Output as JSON')
  .action((taskId: string | undefined, opts: { agent?: string; json?: boolean }) => {
    requireInitialized();
    const json = isJsonMode(opts.json);
    const agent = requireAgentId(opts.agent, 'heartbeat');

    heartbeat(agent, taskId?.toUpperCase());

    if (json) return jsonOut(true, { agent, timestamp: Date.now() });
    // Silent by default — designed to be called frequently by agents
  });
