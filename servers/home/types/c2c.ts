export interface CommandConfig {
  src: string;
  mult?: number; // mult is optional as it's not on ddos/share
  targeted: boolean;
}

export interface Commands {
  hack: CommandConfig;
  grow: CommandConfig;
  weaken: CommandConfig;
  ddos: CommandConfig;
  share: CommandConfig;
}

export interface TaskAllocation {
  grow: number;
  weaken: number;
  hack: number;
  ddos?: number; // ddos/share might not be in the core allocation tasks
  share?: number;
}

export interface TargetData {
  money: { max: number; current: number };
  security: { min: number; base: number; current: number };
  growth: number;
  time: number;
  chance: number;
}

export interface Target {
  hostname: string;
  data: TargetData;
  score?: number;
}

export interface ServerAllocation extends Target {
  tasks: TaskAllocation;
}

export interface C2CState {
  allocations: { [key: string]: ServerAllocation };
  hack: string[];
  grow: string[];
  weaken: string[];
  ddos: string[];
  share: string[];
  goal: string | undefined;
  targets: Target[];
  reserved_on_home: number;
}

export interface OptimizationResult {
  targets: string[]; // Hostnames of targets optimized for
  threads: TaskAllocation; // Total threads *added* during this optimization run
}

export interface HacksDictionary {
  brute: boolean;
  ftp: boolean;
  http: boolean;
  sql: boolean;
  smtp: boolean;
  [key: string]: boolean; // Allow other properties just in case, though the switch only uses these five
}
