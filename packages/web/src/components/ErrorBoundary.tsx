import { Component, type ReactNode } from 'react';
import { Alert, Button, Space } from 'antd';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

/** 全局错误边界：渲染异常时展示错误详情而非白屏 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[zmail] render error:', error, info);
  }

  handleReset = () => {
    this.setState({ error: null });
    window.location.hash = '#/';
  };

  render() {
    if (this.state.error) {
      return (
        <div className="center-page" style={{ padding: 24 }}>
          <div style={{ maxWidth: 720, width: '100%' }}>
            <Alert
              type="error"
              showIcon
              message="页面渲染出错"
              description={
                <div>
                  <p>原因：{this.state.error.message || String(this.state.error)}</p>
                  <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, background: '#fafafa', padding: 12, borderRadius: 6, maxHeight: 240, overflow: 'auto' }}>
                    {this.state.error.stack || ''}
                  </pre>
                </div>
              }
            />
            <Space style={{ marginTop: 16 }}>
              <Button type="primary" onClick={this.handleReset}>返回首页</Button>
              <Button onClick={() => window.location.reload()}>刷新页面</Button>
            </Space>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
