import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import FlowCanvas from './components/FlowCanvas.jsx';

export default function App() {
  return (
    <ReactFlowProvider>
      <FlowCanvas />
    </ReactFlowProvider>
  );
}
