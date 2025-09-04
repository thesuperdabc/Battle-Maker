// Quick safety test - run this first!
const fs = require('fs');

console.log('SAFETY CHECK - Testing configuration...\n');

try {
  // Test config files exist and are valid
  const config = JSON.parse(fs.readFileSync('config/teamfight.config.json', 'utf8'));
  const teams = JSON.parse(fs.readFileSync('config/teamfight.teams.json', 'utf8'));
  const state = JSON.parse(fs.readFileSync('config/auto-teamfight.state.json', 'utf8'));
  
  console.log('Configuration files loaded successfully');
  
  // Check critical settings
  console.log('\nCurrent Settings:');
  console.log(`   Host Team: ${config.hostTeamId}`);
  console.log(`   Server: ${config.server}`);
  console.log(`   Timezone: ${config.timezone}`);
  console.log(`   Tournament Duration: ${config.minutes} minutes (${config.minutes/60} hours)`);
  console.log(`   Clock: ${config.clockTime}+${config.clockIncrement}`);
  console.log(`   Rated: ${config.rated}`);
  
  console.log('\nTeams:');
  teams.teams.forEach(team => console.log(`   - ${team}`));
  
  console.log('\nCurrent State:');
  console.log(`   Last Tournament Day: ${state.lastTournamentDayNum}`);
  console.log(`   Next Tournament Day: ${state.lastTournamentDayNum + 1}`);
  
  // Check OAuth token
  const hasToken = !!process.env.OAUTH_TOKEN;
  console.log(`\nOAuth Token: ${hasToken ? 'Set' : 'Missing'}`);
  
  if (!hasToken) {
    console.log('\nWARNING: Set OAUTH_TOKEN environment variable before running!');
    console.log('   export OAUTH_TOKEN="your_lichess_token"');
  }
  
  // Predict next tournaments (4 tournaments - 2 days worth)
  console.log('\nNext 4 Tournaments Will Be:');
  const nextDay = state.lastTournamentDayNum + 1;
  const day1Name = config.nameTemplates.day.replace('{DAY_NUM}', nextDay).replace('{DAY_OR_NIGHT}', 'Day');
  const night1Name = config.nameTemplates.night.replace('{DAY_NUM}', nextDay).replace('{DAY_OR_NIGHT}', 'Night');
  const day2Name = config.nameTemplates.day.replace('{DAY_NUM}', nextDay + 1).replace('{DAY_OR_NIGHT}', 'Day');
  const night2Name = config.nameTemplates.night.replace('{DAY_NUM}', nextDay + 1).replace('{DAY_OR_NIGHT}', 'Night');
  console.log(`   ${day1Name}`);
  console.log(`   ${night1Name}`);
  console.log(`   ${day2Name}`);
  console.log(`   ${night2Name}`);
  
  console.log('\nSAFETY CHECK PASSED - Configuration looks good!');
  console.log('\nTo test safely, run:');
  console.log('   yarn run create:test');
  console.log('\nTo create real tournaments, run:');
  console.log('   yarn run create:tournaments');
  
} catch (error) {
  console.error('SAFETY CHECK FAILED:', error.message);
  console.log('\nPlease fix the configuration before proceeding!');
  process.exit(1);
}