#!/usr/bin/env node --import=data:text/javascript,import{register}from"node:module";import{pathToFileURL}from"node:url";register("ts-node/esm",pathToFileURL("./"))

import {execute} from '@oclif/core'

await execute({dir: import.meta.url})
