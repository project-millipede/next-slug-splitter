export type {
  AbsoluteModuleReference,
  RelativeModuleReference,
  ModuleReference,
  PackageModuleReference,
  ResolvedModuleReference
} from './types';

export {
  absoluteModule,
  relativeModule,
  packageModule
} from './create';

export {
  isAbsoluteModuleReference,
  isRelativeModuleReference,
  isModuleReference,
  isPackageModuleReference
} from './guards';

export {
  getModuleReferenceValue,
  isSameModuleReference
} from './compare';

export { normalizeModuleReference } from './normalize';

export {
  resolveModuleReferenceToFilePath,
  resolveModuleReferenceToPath
} from './resolve';

export {
  toEmittedImportSource,
  toEmittedImportSpecifier
} from './emit';
