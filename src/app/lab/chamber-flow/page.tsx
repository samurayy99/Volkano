import { SpatialChamberLab } from "@/labs/chamber-flow/SpatialChamberLab";

export const metadata = {
  title: 'Lab Spike: Flow Ref Integration',
  description: 'Isolated testing ground for the WebGPU particle simulator.',
};

export default function ChamberFlowLabPage() {
  return <SpatialChamberLab />;
}
