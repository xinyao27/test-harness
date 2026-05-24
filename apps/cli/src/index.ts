#!/usr/bin/env node
import { greet } from "@test-harness/core";

const [, , command] = process.argv;

switch (command) {
  case "check":
  case "test":
  case "report":
  case "verify":
    console.log(greet(command));
    break;
  default:
    console.log("Usage: harness <check|test|report|verify>");
    process.exitCode = command ? 1 : 0;
}
