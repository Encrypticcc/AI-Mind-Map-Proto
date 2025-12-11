import { useState } from 'react';
import { ASK_AI_ENDPOINT, BACKEND_URL } from '../constants/appConstants.js';
import { getNodeTypeId } from '../utils/graphUtils.js';

export default function AiCopilot({ selectedNodes, onApplySuggestions }) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [answer, setAnswer] = useState(null);

  const handleOpen = () => {
    setIsOpen(true);
    setInput('');
    setAnswer(null);
    setError(null);
    setIsLoading(false);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleSubmit = async (event) => {
    event?.preventDefault?.();
    const prompt = input.trim();
    if (!prompt) return;

    setIsLoading(true);
    setError(null);
    setAnswer(null);

    const selectedNodesPayload = (selectedNodes ?? [])
      .map((node) => {
        if (!node?.id) return null;
        const label = typeof node?.data?.label === 'string' ? node.data.label : '';
        const nodeType = getNodeTypeId(node);
        const isDescriptive = nodeType === 'descriptive';
        return {
          id: node.id,
          label: label.trim().length ? label : node.id,
          notes: node?.data?.notes ?? undefined,
          nodeType,
          type: nodeType,
          isDescriptive,
        };
      })
      .filter(Boolean);

    const body = { prompt };
    if (selectedNodesPayload.length) {
      body.selectedNodes = selectedNodesPayload;
    }

    try {
      const response = await fetch(`${BACKEND_URL}${ASK_AI_ENDPOINT}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        let message = 'Request failed.';
        try {
          const errorData = await response.json();
          message = errorData?.error || message;
        } catch (_) {
          // ignore parse errors
        }
        throw new Error(message);
      }

      const data = await response.json();
      const payload = {
        reply: typeof data?.reply === 'string' ? data.reply : '',
        newNodes: Array.isArray(data?.newNodes) ? data.newNodes : [],
        updatedNodes: Array.isArray(data?.updatedNodes) ? data.updatedNodes : [],
        suggestedConnections: Array.isArray(data?.suggestedConnections)
          ? data.suggestedConnections
          : [],
      };

      setAnswer(payload.reply || 'Agent responded but did not include a reply.');
      if (onApplySuggestions) {
        onApplySuggestions(payload);
      }
    } catch (err) {
      console.error('Ask AI error', err);
      setError(err?.message || 'Something went wrong talking to the Agent. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="ai-card">
      <p>Ask for ideas, reword nodes, or auto-connect concepts.</p>
      <button type="button" className="primary full" onClick={handleOpen}>
        Ask Agent
      </button>

      {isOpen ? (
        <div className="ai-dialog-backdrop">
          <div className="ai-dialog" role="dialog" aria-modal="true">
            <div className="ai-dialog-title">Ask Agent</div>
            <p className="ai-dialog-helper">
              Ask for ideas, reword nodes, or auto-connect concepts. The Agent will use the currently selected nodes as
              context.
            </p>
            <form className="ai-dialog-form" onSubmit={handleSubmit}>
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Describe what you'd like help with..."
                rows="4"
              ></textarea>

              <div className="ai-dialog-status">
                {isLoading ? <span className="ai-dialog-thinking">Thinking...</span> : null}
              </div>

              {error ? <div className="ai-dialog-error">{error}</div> : null}
              {answer ? <div className="ai-dialog-answer">{answer}</div> : null}

              <div className="ai-dialog-actions">
                <button type="button" className="ghost" onClick={handleClose} disabled={isLoading}>
                  Close
                </button>
                <button type="submit" className="primary" disabled={isLoading || !input.trim()}>
                  {isLoading ? 'Sending...' : 'Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
