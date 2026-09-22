import { guide, help, types } from "./guide.js";
import { request } from "./request.js";
import { runScript } from "./run-script.js";

try {
  const args = process.argv.slice(2);
  if (args.length > (["inspect", "run"].includes(args[0]) ? 2 : 1))
    throw new Error("Unexpected arguments; run freac help.");
  switch (args[0] ?? "help") {
    case "help":
    case "--help":
    case "-h":
      console.log(help);
      break;
    case "docs":
      console.log(guide);
      break;
    case "types":
      console.log(types);
      break;
    case "run":
      if (!args[1]) throw new Error("Usage: freac run script.ts");
      console.log(JSON.stringify(await runScript(args[1]), null, 2));
      break;
    case "status":
    case "selection":
    case "inspect":
    case "render":
      console.log(JSON.stringify(await request(args[0], args[1]), null, 2));
      break;
    default:
      throw new Error("Unknown Freac command; run freac help.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
