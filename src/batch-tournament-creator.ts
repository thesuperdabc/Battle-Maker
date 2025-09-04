import fetch from "node-fetch";
import { URLSearchParams } from "url";
import * as fs from "fs";

interface BatchTournamentConfig {
  server: string;
  hostTeamId: string;
  timezone: string;
  minutes: number;
  clockTime: number;
  clockIncrement: number;
  rated: boolean;
  variant: string;
  teams: string[];
  dryRun?: boolean;
}

interface BatchState {
  lastTournamentDayNum: number;
  currentBatch: number;
  batchStartTime: string;
  lastBatchCompletionTime: string;
  isRunning: boolean;
}

function readJSON<T>(path: string): T {
  const raw = fs.readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}

function writeJSON<T>(path: string, data: T): void {
  fs.writeFileSync(path, JSON.stringify(data, null, 2), "utf8");
}

function createTournamentDate(year: number, month: number, day: number, hour: number, minute: number): string {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  return date.toISOString();
}

function buildTournamentName(dayNum: number, type: 'Day' | 'Night'): string {
  return `LMAO ${type} '${dayNum}'`;
}

function buildDescription(dayNum: number, type: 'Day' | 'Night'): string {
  return `Welcome to the LMAO ${type} '${dayNum}' Team Battle! Have fun and fair play!`;
}

function validateOAuthToken(token: string): boolean {
  if (!token || token.trim() === "") {
    return false;
  }
  
  if (token.includes("***") || token.includes("YOUR_TOKEN") || token.includes("PLACEHOLDER")) {
    return false;
  }
  
  const tokenRegex = /^[a-zA-Z0-9_-]+$/;
  return tokenRegex.test(token) && token.length > 10;
}

async function createTeamBattle(params: {
  server: string;
  token: string;
  name: string;
  description: string;
  clockTime: number;
  clockIncrement: number;
  minutes: number;
  rated: boolean;
  variant: string;
  startDateISO: string;
  hostTeamId: string;
  teams: string[];
  dryRun?: boolean;
}): Promise<{ ok: boolean; url?: string; error?: string }> {
  
  if (!validateOAuthToken(params.token)) {
    return { ok: false, error: "Invalid or missing OAuth token. Please set a valid OAUTH_TOKEN environment variable." };
  }

  const body = new URLSearchParams({
    name: params.name,
    description: params.description,
    clockTime: String(params.clockTime),
    clockIncrement: String(params.clockIncrement),
    minutes: String(params.minutes),
    rated: params.rated ? 'true' : 'false',
    variant: params.variant,
    startDate: params.startDateISO,
    teamBattleByTeam: params.hostTeamId,
    nbLeaders: '20'
  });

  const invitedTeams = params.teams.filter((t) => t && t !== params.hostTeamId);
  invitedTeams.forEach((t) => body.append('teams[]', t));

  if (params.dryRun) {
    console.log(`[DRY RUN] Would create: ${params.name}`);
    console.log(`[DRY RUN] Start: ${params.startDateISO}`);
    console.log(`[DRY RUN] Teams: ${invitedTeams.join(', ')}`);
    return { ok: true, url: `${params.server}/team/${params.hostTeamId}/arena/pending` };
  }

  try {
    // Try the correct Lichess API endpoint for creating team tournaments
    const apiUrl = `${params.server}/api/tournament`;
    console.log(`Making request to: ${apiUrl}`);
    console.log(`Team ID: ${params.hostTeamId}`);
    console.log(`Authorization header: Bearer ${params.token.substring(0, 10)}...`);
    
    // Add teamBattleByTeam to the body for team tournaments
    body.append('teamBattleByTeam', params.hostTeamId);
    
    // Add all teams to the battle
    const allTeams = [params.hostTeamId, ...invitedTeams];
    allTeams.forEach((teamId) => {
      body.append('teamBattleTeams', teamId);
    });
    
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'LMAO-Teamfights-Creator/1.0'
      },
      body,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("Tournament creation failed:", res.status, errorText);
      return { ok: false, error: `${res.status}: ${errorText}` };
    }

    const data: any = await res.json();
    const url = data?.id ? `${params.server}/tournament/${data.id}` : res.headers.get('Location') || 'unknown';
    console.log("Created tournament:", url);
    return { ok: true, url };

  } catch (error) {
    console.error("Network error:", error);
    return { ok: false, error: String(error) };
  }
}

function generateTournamentSchedule(startDayNum: number, startDate: Date): Array<{
  name: string;
  description: string;
  startDateISO: string;
  dayNum: number;
  type: 'Day' | 'Night';
}> {
  const tournaments = [];
  
  // Special case: Start with Night 24 on Sep 7, 2025 at 18:58 UTC
  if (startDayNum === 24) {
    tournaments.push({
      name: buildTournamentName(24, 'Night'),
      description: buildDescription(24, 'Night'),
      startDateISO: createTournamentDate(2025, 9, 7, 18, 58), // Sep 7, 2025 at 6:58 PM UTC
      dayNum: 24,
      type: 'Night' as const
    });
    
    // Then continue with Day 25, Night 25, etc.
    for (let dayOffset = 1; dayOffset < 7; dayOffset++) {
      const currentDayNum = 24 + dayOffset;
      const targetDate = new Date(2025, 8, 7 + dayOffset); // Sep 8, 9, 10, etc.
      
      const year = targetDate.getUTCFullYear();
      const month = targetDate.getUTCMonth() + 1;
      const day = targetDate.getUTCDate();

      // Day tournament at 7:00 UTC
      tournaments.push({
        name: buildTournamentName(currentDayNum, 'Day'),
        description: buildDescription(currentDayNum, 'Day'),
        startDateISO: createTournamentDate(year, month, day, 7, 0),
        dayNum: currentDayNum,
        type: 'Day' as const
      });

      // Night tournament at 18:58 UTC (6:58 PM)
      tournaments.push({
        name: buildTournamentName(currentDayNum, 'Night'),
        description: buildDescription(currentDayNum, 'Night'),
        startDateISO: createTournamentDate(year, month, day, 18, 58),
        dayNum: currentDayNum,
        type: 'Night' as const
      });
    }
  } else {
    // Normal schedule for future cycles
    for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
      const currentDayNum = startDayNum + dayOffset;
      const targetDate = new Date(startDate);
      targetDate.setUTCDate(targetDate.getUTCDate() + dayOffset);
      
      const year = targetDate.getUTCFullYear();
      const month = targetDate.getUTCMonth() + 1;
      const day = targetDate.getUTCDate();

      // Day tournament at 7:00 UTC
      tournaments.push({
        name: buildTournamentName(currentDayNum, 'Day'),
        description: buildDescription(currentDayNum, 'Day'),
        startDateISO: createTournamentDate(year, month, day, 7, 0),
        dayNum: currentDayNum,
        type: 'Day' as const
      });

      // Night tournament at 18:58 UTC (6:58 PM)
      tournaments.push({
        name: buildTournamentName(currentDayNum, 'Night'),
        description: buildDescription(currentDayNum, 'Night'),
        startDateISO: createTournamentDate(year, month, day, 18, 58),
        dayNum: currentDayNum,
        type: 'Night' as const
      });
    }
  }
  
  return tournaments;
}

async function createBatchOfTournaments(
  tournaments: Array<any>,
  batchStart: number,
  batchSize: number,
  config: BatchTournamentConfig,
  oauthToken: string
): Promise<{ successCount: number; failureCount: number }> {
  let successCount = 0;
  let failureCount = 0;
  
  const batchTournaments = tournaments.slice(batchStart, batchStart + batchSize);
  
  console.log(`\n=== Creating Batch of ${batchTournaments.length} Tournaments ===`);
  
  for (let i = 0; i < batchTournaments.length; i++) {
    const tournament = batchTournaments[i];
    
    console.log(`\n--- Creating ${tournament.type} Battle ${tournament.dayNum} ---`);
    console.log("Name:", tournament.name);
    console.log("Start:", tournament.startDateISO);

    if (i > 0) {
      console.log("Waiting 10 seconds to avoid rate limits...");
      await new Promise(resolve => setTimeout(resolve, 10000));
    }

    const result = await createTeamBattle({
      server: config.server,
      token: oauthToken,
      name: tournament.name,
      description: tournament.description,
      clockTime: config.clockTime,
      clockIncrement: config.clockIncrement,
      minutes: config.minutes,
      rated: config.rated,
      variant: config.variant,
      startDateISO: tournament.startDateISO,
      hostTeamId: config.hostTeamId,
      teams: config.teams,
      dryRun: config.dryRun,
    });

    if (result.ok) {
      successCount++;
      console.log(`${tournament.type} battle created successfully`);
    } else {
      failureCount++;
      console.error(`Failed to create ${tournament.type} battle: ${result.error}`);
    }
  }
  
  return { successCount, failureCount };
}

async function main() {
  try {
    const oauthToken = process.env.OAUTH_TOKEN;
    if (!oauthToken) {
      throw new Error("OAUTH_TOKEN environment variable is required");
    }

    // Load configuration
    const config: BatchTournamentConfig = {
      server: "https://lichess.org",
      hostTeamId: "rare",
      timezone: "UTC",
      minutes: 720, // 12 hours
      clockTime: 3,
      clockIncrement: 0,
      rated: true,
      variant: "standard",
      teams: ["rare", "darkonteams", "tekio"],
      dryRun: process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true'
    };

    // Load or initialize batch state
    const stateFilePath = "config/batch-tournament.state.json";
    let state: BatchState;
    try {
      state = readJSON<BatchState>(stateFilePath);
    } catch (error) {
      console.warn(`Could not read ${stateFilePath}, initializing with default state.`);
      state = {
        lastTournamentDayNum: 23,
        currentBatch: 0,
        batchStartTime: "",
        lastBatchCompletionTime: "",
        isRunning: false
      };
    }

    const now = new Date();
    
    // Check if we should start a new 7-day cycle
    const shouldStartNewCycle = !state.isRunning && (
      !state.lastBatchCompletionTime || 
      (now.getTime() - new Date(state.lastBatchCompletionTime).getTime()) >= (7 * 24 * 60 * 60 * 1000) // 7 days
    );

    if (shouldStartNewCycle) {
      console.log("Starting new 7-day tournament cycle...");
      state.currentBatch = 1;
      state.batchStartTime = now.toISOString();
      state.isRunning = true;
      writeJSON(stateFilePath, state);
    }

    if (!state.isRunning) {
      console.log("No batch cycle is currently running. Next cycle will start after 7 days from last completion.");
      return;
    }

    // Check if enough time has passed for next batch (5 hours)
    const timeSinceLastBatch = now.getTime() - new Date(state.batchStartTime).getTime();
    const hoursPerBatch = 5;
    const expectedBatch = Math.floor(timeSinceLastBatch / (hoursPerBatch * 60 * 60 * 1000)) + 1;

    if (expectedBatch < state.currentBatch) {
      const nextBatchTime = new Date(new Date(state.batchStartTime).getTime() + (state.currentBatch * hoursPerBatch * 60 * 60 * 1000));
      console.log(`Waiting for next batch. Next batch ${state.currentBatch} starts at: ${nextBatchTime.toISOString()}`);
      return;
    }

    if (state.currentBatch > 4) {
      console.log("All batches completed for this cycle. Waiting for next 7-day cycle.");
      state.isRunning = false;
      state.lastBatchCompletionTime = now.toISOString();
      writeJSON(stateFilePath, state);
      return;
    }

    // Generate tournaments for the current cycle
    const startDayNum = state.lastTournamentDayNum + 1;
    const startDate = new Date(state.batchStartTime);
    const allTournaments = generateTournamentSchedule(startDayNum, startDate);

    console.log(`\n=== BATCH ${state.currentBatch}/4 ===`);
    console.log(`Creating tournaments ${startDayNum} to ${startDayNum + 6}`);
    console.log(`Total tournaments in cycle: ${allTournaments.length}`);

    // Determine batch size and start index
    let batchStart: number;
    let batchSize: number;

    switch (state.currentBatch) {
      case 1:
        batchStart = 0;
        batchSize = 4;
        break;
      case 2:
        batchStart = 4;
        batchSize = 4;
        break;
      case 3:
        batchStart = 8;
        batchSize = 4;
        break;
      case 4:
        batchStart = 12;
        batchSize = 2;
        break;
      default:
        throw new Error(`Invalid batch number: ${state.currentBatch}`);
    }

    // Create the batch
    const result = await createBatchOfTournaments(
      allTournaments,
      batchStart,
      batchSize,
      config,
      oauthToken
    );

    console.log(`\n=== BATCH ${state.currentBatch} SUMMARY ===`);
    console.log(`Successful: ${result.successCount}`);
    console.log(`Failed: ${result.failureCount}`);

    // Update state for next batch
    if (result.successCount > 0) {
      state.currentBatch++;
      
      // If this was the last batch, update the day counter
      if (state.currentBatch > 4) {
        state.lastTournamentDayNum = startDayNum + 6; // 7 days worth
        state.isRunning = false;
        state.lastBatchCompletionTime = now.toISOString();
        console.log(`\nCycle completed! Next cycle will start from Day ${state.lastTournamentDayNum + 1}`);
      }
      
      writeJSON(stateFilePath, state);
    }

    if (result.failureCount > 0) {
      console.log(`\nSome tournaments failed to create. Check the errors above.`);
      process.exit(1);
    }

  } catch (error) {
    console.error("Fatal error:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
