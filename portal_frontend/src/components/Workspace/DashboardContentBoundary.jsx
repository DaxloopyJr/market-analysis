/**
 * Confines dashboard render failures to the dashboard's Outlet region.
 * DashboardLayout owns Sidebar/Topbar/Footer and is outside this boundary.
 * This is a last-resort fallback, not a replacement for fixing runtime errors.
 */
import { Component } from 'react';
import './DashboardContentBoundary.css';

export default class DashboardContentBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error, info) {
    console.error('[VIWANDA Dashboard] content rendering error:', error, info?.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <section className="vi-dashboard-error" role="alert" aria-live="assertive">
          <h2>Dashboard content could not be displayed</h2>
          <p>The rest of the portal is still available. Please retry loading this dashboard.</p>
          <button type="button" onClick={() => this.setState({ failed: false })}>
            Retry dashboard
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
