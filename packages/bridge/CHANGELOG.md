# @triplex/bridge

## 0.39.0

## 0.38.0

## 0.37.0

### Minor Changes

- 23fe64a: Adds delete scene object. Access through the context panel when focusing on a scene object.
- 1a2ecea: Iframe client bridge can now wait for a response from host.

## 0.36.0

## 0.35.0

## 0.34.0

### Minor Changes

- 2a64658: The context panel now displays all available props on a component even if they aren't yet declared thanks to the TypeScript compiler and ts-morph. Not all prop types are supported currently, if you have one that you expected to be available but isn't please reach out.

## 0.33.0

### Minor Changes

- 1067d23: Adds transform controls to the ui.

## 0.32.0

### Minor Changes

- c87a5f3: Undo/redo now available. When manipulating the scene through transform controls or the context panel each persisted manipulation will be able to be undone (and redone) using hotkeys and the edit menu actions.

## 0.31.0

## 0.30.0

### Minor Changes

- 0bb6119: Adds support for updating scene objects through the context panel.

## 0.29.0

## 0.28.0

## 0.27.0

## 0.26.0

## 0.25.0

## 0.24.0

## 0.23.0

## 0.22.0

## 0.21.0

## 0.20.0

### Minor Changes

- 1c9771d: Focus events now only use line and column numbers.

## 0.19.0

## 0.18.0

## 0.17.0

## 0.16.0

### Minor Changes

- d8e1602: Fixed non-scene objects not being able to be selected through the UI.
- 7ff35f3: Upgrades @react-three/fiber to latest.
- 2fa7c45: Adds author field to package.json.

## 0.15.0

### Minor Changes

- e54e0f8: Bridge events now flow unidirectionally enabling the editor ui to initiate events to the scene, such as navigate and focus.

## 0.14.0

## 0.7.0

### Minor Changes

- a4d6882: Passes name during object focus.

## 0.6.0

### Minor Changes

- 3c725bc: Force release all packages.

## 0.5.0

### Minor Changes

- ac9624f: Fixes client/host race condition where host would send events before the client has connected.

## 0.4.0

### Minor Changes

- b144bb1: Package `build` now use `swc` and `tsc` directly.

## 0.3.0

### Minor Changes

- bbc457e: Fixes some bugs preventing triplex from being able to be ran via cli.

## 0.2.0

### Minor Changes

- 08a03af: Fixes publish to build before pushing.

## 0.1.0

### Minor Changes

- 9c120b4: Initial release.