import { detectProjectType } from "./src/utils/projectUtils";

const p = { Name: "Demo 25MW", name: "Demo 25MW" };
console.log(detectProjectType(p));
