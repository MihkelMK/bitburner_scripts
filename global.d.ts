import {
  NS as _NS,
  TIX as _TIX,
  ProcessInfo as _ProcessInfo,
  Server as _Server,
  AutocompleteData as _AutocompleteData,
} from 'NetscriptDefinitions';

declare global {
  type NS = _NS;
  type TIX = _TIX;
  type ProcessInfo = _ProcessInfo;
  type Server = _Server;
  type AutocompleteData = _AutocompleteData;
}
