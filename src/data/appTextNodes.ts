/**
 * App graph node types that only move TEXT between ports (no API).
 * Used for topology demos: fan-out (Tee), fan-in (Join), simple transforms.
 */

export const APP_TEXT_NODE_TYPES = [
  'AppJoin',
  'AppToolsJoin',
  'AppTee',
  'AppPrefix',
  'AppPick',
  'AppRetrieve',
  'AppSpamRules',
  'AppSpamItemSource',
] as const

export type AppTextNodeType = (typeof APP_TEXT_NODE_TYPES)[number]

/** Node types that show in the inspector when selected (app pipeline + text utils). */
export const APP_INSPECTOR_TYPES = [
  'AppInput',
  'AppLlm',
  'AppOutput',
  ...APP_TEXT_NODE_TYPES,
  'AppAgent',
  'AppTool',
] as const
