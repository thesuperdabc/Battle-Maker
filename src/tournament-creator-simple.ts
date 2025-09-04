import fetch from "node-fetch";
import { URLSearchParams } from "url";
import * as fs from "fs";

interface TournamentConfig {
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

interface TournamentState {
  lastTournamentDayNum: number;
}

function readJSON<T>(path: string): T {
  const raw = fs.readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function createTournamentDate(year: number, month: number, day: number, hour: number, minute: number): string {
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  return date.toISOString();
}

function buildTournamentName(dayNum: number, type: 'Day' | 'Night'): string {
  return `LMAO ${type} '${dayNum}' Team Battle`;
}

function buildDescription(dayNum: number, type: 'Day' | 'Night'): string {
  return `Welcome to the LMAO ${type} '${dayNum}' Team Battle! Have fun and fair play!`;
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
  
  // Validate token before using it
  if (!params.token || params.token.trim() === "" || params.token.includes("***") || params.token.includes("YOUR_TOKEN")) {
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
    hostTeamId: params.hostTeamId,
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
    const res = await fetch(`${params.server}/api/team/${params.hostTeamId}/arena`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${params.token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
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

async function main() {
  try {
    // Get OAuth token from environment
    const oauthToken = process.env.OAUTH_TOKEN;
    if (!oauthToken) {
      throw new Error("OAUTH_TOKEN environment variable is required");
    }

    // Load configuration
    const config: TournamentConfig = {
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

    // Load or initialize state
    const stateFilePath = "config/auto-teamfight.state.json";
    let state: TournamentState;
    try {
      state = readJSON<TournamentState>(stateFilePath);
    } catch (error) {
      console.warn(`Could not read ${stateFilePath}, starting from Day 24`);
      state = { lastTournamentDayNum: 24 };
    }

    // Calculate next tournament numbers
    let nextDayNum = state.lastTournamentDayNum + 1;
    
    // Get current date
    const now = new Date();
    const currentYear = now.getUTCFullYear();
    const currentMonth = now.getUTCMonth() + 1;
    const currentDay = now.getUTCDate();

    // Create tournaments for 2 days (4 tournaments total)
    const tournaments = [];
    
    for (let dayOffset = 0; dayOffset < 2; dayOffset++) {
      const tournamentDayNum = nextDayNum + dayOffset;
      const targetDate = new Date(currentYear, currentMonth - 1, currentDay + dayOffset);
      const targetYear = targetDate.getFullYear();
      const targetMonth = targetDate.getMonth() + 1;
      const targetDay = targetDate.getDate();

      // Day tournament at 6:58 UTC
      tournaments.push({
        name: buildTournamentName(tournamentDayNum, 'Day'),
        description: buildDescription(tournamentDayNum, 'Day'),
        startDateISO: createTournamentDate(targetYear, targetMonth, targetDay, 6, 58),
        dayNum: tournamentDayNum,
        type: 'Day' as const
      });

      // Night tournament at 18:58 UTC
      tournaments.push({
        name: buildTournamentName(tournamentDayNum, 'Night'),
        description: buildDescription(tournamentDayNum, 'Night'),
        startDateISO: createTournamentDate(targetYear, targetMonth, targetDay, 18, 58),
        dayNum: tournamentDayNum,
        type: 'Night' as const
      });
    }

    console.log(`Creating ${tournaments.length} tournaments (Days ${nextDayNum}-${nextDayNum + 1})`);
    console.log(`Teams: ${config.teams.join(', ')}`);

    let successCount = 0;
    let failureCount = 0;

    // Create tournaments
    for (let i = 0; i < tournaments.length; i++) {
      const tournament = tournaments[i];
      
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

    // Update state if successful
    if (successCount > 0) {
      const maxDayNum = Math.max(...tournaments.map(t => t.dayNum));
      state.lastTournamentDayNum = maxDayNum;
      fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2), "utf8");
      console.log(`\nUpdated state: lastTournamentDayNum = ${state.lastTournamentDayNum}`);
    }

    console.log(`\n=== SUMMARY ===`);
    console.log(`Successful: ${successCount}`);
    console.log(`Failed: ${failureCount}`);
    console.log(`Next tournaments will start from Day: ${state.lastTournamentDayNum + 1}`);

    if (failureCount > 0) {
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