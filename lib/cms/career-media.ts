import type { Career } from "@/payload-types";

type Asset = NonNullable<Career["assets"]>[number];
export type CareerContent = Omit<Career, "jobs"> & {
  jobs?: (NonNullable<Career["jobs"]>[number] & Pick<Asset, "photo" | "documents">)[] | null;
};

export function withCareerMedia(career: Career): CareerContent {
  const assets = new Map((career.assets ?? []).map((asset) => [asset.branchName, asset]));
  return { ...career, jobs: career.jobs?.map((job) => {
    const asset = assets.get(job.branchName);
    return { ...job, photo: asset?.photo ?? null, documents: asset?.documents ?? [] };
  }) };
}
