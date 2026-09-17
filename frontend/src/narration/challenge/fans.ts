import type { QuoteTemplates } from './types';

/** The fans: loudest voice in the building, all heart, occasionally all caps. */
export const FANS_QUOTES: QuoteTemplates = {
  'four-factor': [
    'EVERY GAME. {issue}. We are at {value} and the rest of the league is at {league}. Anyone watching could have told you.',
    'Fix {issue} or stop selling tickets. {value} against {league}. It is not complicated.',
    'The group chat has one topic and it is {issue}. {value}. League: {league}. We have eyes.',
  ],
  'bench-over-starter': [
    'FREE {player}. The kid puts up {points} in {minutes} minutes and he is stuck behind {other}.',
    '{player} for {other}, today. {points} points in {minutes} minutes off the bench. What are we protecting here?',
    'Every arena in the country knows {player} should start. {points} in {minutes} minutes. Let him cook.',
  ],
  'worst-plus-minus': [
    'We have a scoreboard at home too. Games go sideways the second {player} walks on. {value} a night.',
    '{player} at {value} a night in {minutes} minutes and somebody keeps calling his number. Please, no more.',
    'Not being mean, just accurate: {player} is {value} every night he plays. Send him somewhere warm.',
  ],
  'play-unstaffed': [
    'We have been waiting all half to see {play} once. {missing}. Just take it off the sheet already.',
    '{play} is a rumour at this point. {missing}. Put someone in there who can actually do it.',
    'Nobody in the upper deck has seen {play}. {missing}. Cool card, shame about the roster.',
  ],
  'play-idle': [
    '{play} is only for {player} and {player} plays {minutes} minutes. We spend the night waiting for a guy who is sitting down.',
    'Run {play} or bench the idea. {minutes} minutes for {player} is not a game plan.',
    'PLAY {player}. He is the whole point of {play} and he gets {minutes} minutes.',
  ],
  'identity-near': [
    'We are SO close to {plan}. {missing}. One move and this place loses its mind.',
    '{plan} or nothing. {missing}. Make the call, we will forgive the rest.',
    'Been drawing {plan} on posters since October. {missing}. Finish it.',
  ],
  'pace-band': [
    'Hands up if {band} is what we signed up for. Nobody? Right. Do something at the break.',
    '{band} is not a season, it is a shrug. There are forty-one games left, use them.',
    'We can take {band}, we just do not want to. Change one thing and we are back in.',
  ],
  'pace-hold': [
    'DO NOT TOUCH ANYTHING. We are {band}. Hide the phones.',
    'Whoever is reading trade offers: put it down. {band}. We are having the best time of our lives.',
    'This is the first {band} half any of us have lived through. Do not get clever now.',
  ],
  'form-hold': [
    '{points} a night and only {allowed} the other way. We would watch this team read a phone book.',
    'Scoring {points}, allowing {allowed}. Nobody in this section wants a single change.',
    '{points} to {allowed} every night out. Whatever you are doing, keep doing exactly that.',
  ],
  'deep-bench': [
    'Greedy take: {player} has not played in a month, {minutes} minutes a night. Flip him for a lottery ticket. What is the downside?',
    'One tiny gamble. {player}, {minutes} minutes. Nobody will even notice.',
    'Send {player} out for a scratch card. {minutes} minutes a game — we will live.',
  ],
};
