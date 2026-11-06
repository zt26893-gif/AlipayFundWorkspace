/**
 * AlertBadge - 预警标签组件
 * 根据收益率和预设阈值展示不同状态的预警标签
 */

export default function AlertBadge({ level, children }) {
  const config = {
    'take-profit': {
      className: 'alert-badge alert-take-profit',
      icon: '🎯',
    },
    'stop-loss': {
      className: 'alert-badge alert-stop-loss',
      icon: '🚨',
    },
    warning: {
      className: 'alert-badge alert-warning',
      icon: '⚠️',
    },
    normal: {
      className: 'alert-badge alert-normal',
      icon: '✅',
    },
    'no-position': {
      className: 'alert-badge alert-no-position',
      icon: '💤',
    },
  };

  const { className, icon } = config[level] || config.normal;

  return (
    <span className={className}>
      <span className="alert-icon">{icon}</span>
      <span className="alert-text">{children}</span>
    </span>
  );
}
