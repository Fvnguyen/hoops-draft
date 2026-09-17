import type { QuoteTemplates } from './types';

/** The coach: tactical, blunt, talks about the floor and the sheet — never the market. */
export const COACH_QUOTES: QuoteTemplates = {
  'four-factor': [
    'We are giving the game away on {issue}. We sit at {value}, the rest of the league sits at {league}. That is a starting-five problem.',
    'Watch the tape and it is {issue}, every night. {value} against {league} for everybody else. I need different bodies out there.',
    'I can live with a lot. I cannot live with {issue} at {value} when the league gets {league}.',
    'Same story all half: {issue}. {value} for us, {league} for them. Change the five and it changes.',
  ],
  'bench-over-starter': [
    '{player} gives me {points} points in {minutes} minutes a night. {other} is not beating that. The second half starts with {player}.',
    'I have been slow on this one. {player} produces every time he is out there and {other} does not. Promote him.',
    '{points} points in {minutes} minutes off my own bench. If {other} keeps that spot, that is on me.',
  ],
  'worst-plus-minus': [
    'When {player} checks in the game tilts. {value} a night across {minutes} minutes. Those minutes have to go somewhere else.',
    'I keep staring at one number. {player}, {value} a night. Nothing else in the rotation is close.',
    'Every stretch we lose has {player} on the floor for it. {minutes} minutes, {value}. That is not bad luck any more.',
  ],
  'play-unstaffed': [
    '{play} has never once run the way it is drawn up. {missing}. Fix the sheet or take the play off it.',
    'We are carrying {play} for nothing. {missing}. I am not calling a play nobody can run.',
    'Ask me about {play} and I will tell you the truth: {missing}. It has been dead weight all half.',
  ],
  'play-idle': [
    'We drew {play} up for {player} and he is on the floor {minutes} minutes a night. Either he plays or somebody else runs it.',
    '{play} only works with {player} out there, and {minutes} minutes is not out there. Pick one.',
    'I call {play}, I look up, {player} is sitting next to me. {minutes} minutes a game. That is the whole problem.',
  ],
  'identity-near': [
    'We are one move away from playing {plan} for real. {missing}. Get me that and the second half looks different.',
    '{plan} is right there. {missing}. I am not asking for a star, I am asking for a fit.',
    'Half a season of almost. {missing}, and then {plan} is ours.',
  ],
  'pace-band': [
    '{band} is where this is heading, and I am not signing off on that. We have games to take back.',
    'I know what {band} looks like in June. Nobody in this room wants it. Give me one change.',
    'Forty-one more. Right now this team is {band}, and that is on the whiteboard, not on the players.',
  ],
  'pace-hold': [
    'Do not touch my rotation. I mean it. Whatever this is, it is working.',
    'We are {band}. You do not take a wrench to that at the break.',
    'Leave it alone. Every man out there knows his job and does it. {band} does not happen by accident.',
  ],
  'form-hold': [
    '{points} a night scored, {allowed} allowed. You do not fix that at a deadline.',
    'Both ends, every night: {points} for, {allowed} against. I have nothing to complain about and I have tried.',
    'The shape of it is perfect. {points} scored, {allowed} allowed. Do not let anyone talk you out of it.',
  ],
  'deep-bench': [
    '{player} is at {minutes} minutes a night. If somebody wants him, I am not going to notice he is gone.',
    'If you have to do something, do it at the end of my bench. {player}, {minutes} minutes. I will survive.',
    'The only man I would not miss is {player}. {minutes} minutes a game and none of them matter.',
  ],
};
