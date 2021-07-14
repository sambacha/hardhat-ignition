# Hardhat Ignition Tornado deployment tutorial

Actual tornado [readme](./READMEE.md).

## Installation and linking

In the root directory of ignition run:

```
npm link
```

Cd to `example/tornado_cash` and run `npm i` to install all dependencies and link to local
binary of ignition.

## Setup environment file

Create `.env` file and populate fields from `.env.example`.

## Compilation

Compile the project before deploying:

```
npx hardhat compile
```

## Run Node

On a separate terminal, run:

```
npx hardhat node
```

## Run ignition deploy

Run `hardhat-ignition deploy` and choose `module.ts` in file picker.

## Known Hardhat-related artifacts bug

You're likely to get this error:

```
ERROR User error - contract creation without any data provided
```
If you do, paste the contents from this gist https://gist.github.com/filippetroviccc/eae4c2bcea9490a3352f374451b7d074 into `artifacts/contracts/MerkleTreeWithHistory.sol/Hasher.json`.
This is due to a Hardhat bug that will be resolved soon.

