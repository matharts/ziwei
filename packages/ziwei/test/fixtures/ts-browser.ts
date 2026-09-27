import type { Natal } from "@matharts/ziwei";

export async function consumePackageRoot() {
  const packageUrl = new URL("/index.js", location.href);
  const { Branch, Gender, StarName, Ziwei } = await import(packageUrl.href);
  const natal: Natal = Ziwei.fromBirth({
    gender: Gender.Male,
    birthYear: 1984,
    birthMonth: 1,
    birthDay: 6,
    birthHour: Branch.Zi,
  });
  return {
    zodiac: natal.zodiac,
    bureau: natal.fiveElementBureau,
    palaceNames: natal.palaces.map((palace) => palace.name),
    starBranch: natal.palaceByStar(StarName.WuQu).branch,
    decadeStart: natal.decadeYears(0)[0],
  };
}

export function consumePackageWorker() {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("/worker.js", location.href), { type: "module" });
    worker.addEventListener("message", ({ data }) => {
      worker.terminate();
      resolve(data);
    });
    worker.addEventListener("error", (error) => {
      worker.terminate();
      reject(error);
    });
    worker.postMessage({ request: "independent-worker" });
  });
}
