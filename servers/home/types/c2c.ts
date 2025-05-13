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

export interface ServerData {
  time: number;
  money: { max: number };
  // Add other server data properties as needed based on usage
}

export interface TargetData {
  hostname: string;
  tasks: TaskAllocation;
  data: ServerData; // Assuming 'data' holds server info like time and money
}

export interface ServerAllocation {
  tasks: TaskAllocation;
  data?: ServerData; // Optional data if needed per server in allocations
}

export interface C2CState {
  allocations: { [key: string]: ServerAllocation };
  hack: string[];
  grow: string[];
  weaken: string[];
  ddos: string[];
  share: string[];
  goal: string | undefined;
  targets: TargetData[];
  reserved_on_home: number;
}

export interface OptimizationResult {
  targets: string[]; // Hostnames of targets optimized for
  threads: TaskAllocation; // Total threads *added* during this optimization run
}
