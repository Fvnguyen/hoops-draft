```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Player Card Schema",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "Unique identifier for the player."
    },
    "name": {
      "type": "string",
      "description": "Full name of the player."
    },
    "position": {
      "type": "string",
      "description": "Primary playing position (e.g., PG, SG, SF, PF, C)."
    },
    "team": {
      "type": "string",
      "description": "Abbreviation of the player's team (e.g., LAL, BOS)."
    },
    "physicals": {
      "type": "object",
      "properties": {
        "age": { "type": "integer" },
        "height": { "type": "string" },
        "weight": { "type": "integer" }
      }
    },
    "counting_stats": {
      "type": "object",
      "properties": {
        "ppg": { "type": "number" },
        "rpg": { "type": "number" },
        "apg": { "type": "number" },
        "spg": { "type": "number" },
        "bpg": { "type": "number" },
        "fg_pct": { "type": "number" },
        "fg3_pct": { "type": "number" },
        "ts_pct": { "type": "number" },
        "attempts": { "type": "number" }
      }
    },
    "advanced_stats": {
      "type": "object",
      "properties": {
        "mpg": { "type": "number" },
        "gp": { "type": "integer" },
        "per": { "type": "number" },
        "bpm": { "type": "number" },
        "vorp": { "type": "number" },
        "dbpm": { "type": "number" }
      }
    },
    "awards": {
      "type": "array",
      "items": { "type": "string" }
    },
    "game_ratings": {
      "type": "object",
      "properties": {
        "overall": { "type": "integer", "minimum": 1, "maximum": 99 },
        "scoring": { "type": "integer", "minimum": 1, "maximum": 99 },
        "playmaking": { "type": "integer", "minimum": 1, "maximum": 99 },
        "rebounding": { "type": "integer", "minimum": 1, "maximum": 99 },
        "defense": { "type": "integer", "minimum": 1, "maximum": 99 }
      },
      "required": ["overall", "scoring", "playmaking", "rebounding", "defense"]
    },
    "rarity": {
      "type": "string",
      "enum": ["Common", "Uncommon", "Rare", "Mythic"],
      "description": "The rarity tier of the player card."
    },
    "traits": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Special badges or traits assigned to the player based on stats (e.g., Sharpshooter, Lockdown)."
    },
    "cardSetVersion": {
      "type": "string",
      "description": "Card set version this card was generated under (engine/cards.ts CARD_SET_VERSION), stamped by build-cards.ts on every card in the build. Storage compares a saved draft/roster's stamp against the current value to flag it as built from an older card set."
    }
  },
  "required": ["id", "name", "position", "team", "physicals", "counting_stats", "advanced_stats", "awards", "game_ratings", "rarity", "traits", "cardSetVersion"]
}
```
