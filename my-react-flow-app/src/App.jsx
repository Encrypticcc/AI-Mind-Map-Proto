import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ProjectProvider } from './context/ProjectContext.jsx';
import FlowCanvas from './components/FlowCanvas.jsx';

export default function App() {
  return (
    <ProjectProvider>
      <ReactFlowProvider>
        <FlowCanvas />
      </ReactFlowProvider>
    </ProjectProvider>
  );
}
