const shell = document.querySelector('#shell');
const basePath = '/u-ai-board-demo';
const routeHref = (href) => `${basePath}/?screen=${encodeURIComponent(href)}`;
const allowedTaskFlags = new Set(['under10', 'remote', 'beginner']);
const taskDetailPath = /^\/tasks\/([a-zA-Z0-9-]+)$/;
const projectPath = /^\/projects\/([0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})$/;
const changePath = /^\/changes\/([0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})$/;
const yen = new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 });
const taskRankDefinitions = {
  A: { label: '高責任', description: '機密・安全・事業成果に関わる仕事', memberOnly: true },
  B: { label: '専門', description: '専門判断や対外品質が求められる仕事', memberOnly: true },
  C: { label: '実務', description: '基本判断を伴う制作・運用の仕事', memberOnly: true },
  D: { label: '入門', description: '手順が明確な定型・低リスクの仕事', memberOnly: false },
};
const skillLevelDefinitions = {
  A: { label: '上級・責任者', criterion: '関連実績を説明でき、品質・機密・障害時対応まで自律判断できる' },
  B: { label: '経験者', criterion: '関連業務の実績または成果物を提示できる' },
  C: { label: '実務基礎', criterion: '基本操作ができ、手順に沿って自分で品質確認できる' },
  D: { label: '初級', criterion: '未経験でも、手順書に沿って作業・報告できる' },
};

async function apiFetch(input, init) {
  const response = await fetch(input, init);
  if (response.status === 401) {
    location.assign('/auth/login');
    await new Promise(() => {});
  }
  return response;
}

function pendingCommand(store, key, prefix, reason, payload = {}) {
  let command = store.get(key);
  if (!command) {
    const requestId = crypto.randomUUID();
    command = { requestId, body: { ...payload, idempotencyKey: `${prefix}-${requestId}`, reason } };
    store.set(key, command);
  }
  return command;
}

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
})[character]);

function applyTaskRanks(data) {
  const rankById = new Map(Object.entries(data.taskRanks || {})
    .flatMap(([rank, ids]) => ids.map((id) => [id, rank])));
  data.tasks = (data.tasks || []).map((task) => ({ ...task, rank: rankById.get(task.id) || 'C' }));
  return data;
}

const isUwordMember = (data) => data.member?.isUwordMember === true;
const taskRank = (task) => taskRankDefinitions[task.rank] || taskRankDefinitions.C;
const skillLevel = (task) => skillLevelDefinitions[task.rank] || skillLevelDefinitions.C;
const rankBadge = (task) => {
  const rank = taskRank(task);
  return `<span class="rank-badge rank-${escapeHtml(task.rank || 'C').toLowerCase()}">ランク ${escapeHtml(task.rank || 'C')}</span><span class="rank-label">${escapeHtml(rank.label)} — ${escapeHtml(rank.description)}</span>`;
};

function skillRequirement(task, locked = false) {
  if (locked) {
    return `<section class="skill-requirement skill-requirement-locked" aria-label="必要スキルは会員限定">
      <div class="skill-heading"><strong>必要スキル</strong><span class="skill-level">会員限定</span></div>
      <p>具体的なスキルと応募目安は、U-WORD会員のみ確認できます。</p>
    </section>`;
  }
  const skills = Array.isArray(task.skills) ? task.skills : [];
  const level = skillLevel(task);
  return `<section class="skill-requirement" aria-label="必要スキル">
    <div class="skill-heading"><strong>必須スキル</strong><span class="skill-level">${escapeHtml(level.label)}</span></div>
    <div class="skills">${skills.map((skill) => `<span class="skill">${escapeHtml(skill)}</span>`).join('')}</div>
    <p><span>応募できる目安</span>${escapeHtml(level.criterion)}</p>
  </section>`;
}

const path = (new URLSearchParams(location.search).get('screen') || '/tasks').replace(/\/$/, '');

const navItems = [
  ['/tasks', '仕事を探す'],
  ['/me', 'マイページ'],
  ['/projects', 'プロジェクト'],
  ['/admin', '管理'],
];

function isCurrent(href) {
  if (href === '/tasks') return path.startsWith('/tasks') || path === '/';
  if (href === '/projects') return path.startsWith('/projects');
  return path === href;
}

function header(meta) {
  return `
    <header class="site-header">
      <div class="brand-row">
        <a class="brand" href="${routeHref('/tasks')}">U-AI協会 案件掲示板</a>
        <span class="brand-note">紹介制の仕事を、確かな条件でつなぐ</span>
      </div>
      <nav class="primary-nav" aria-label="主要メニュー">
        ${navItems.map(([href, label]) => `<a class="nav-link" href="${routeHref(href)}"${isCurrent(href) ? ' aria-current="page"' : ''}>${label}</a>`).join('')}
      </nav>
    </header>
    <aside class="mock-banner" aria-label="ローカルモックの注意">
      <div class="mock-banner-inner">
        <strong>${escapeHtml(meta.label)}</strong>
        <p>${escapeHtml(meta.notice)}</p>
      </div>
    </aside>`;
}

function pageHeader(eyebrow, title, description = '') {
  return `<header class="page-header">
    <span class="eyebrow">${escapeHtml(eyebrow)}</span>
    <h1>${escapeHtml(title)}</h1>
    ${description ? `<p>${escapeHtml(description)}</p>` : ''}
  </header>`;
}

function taskCard(task, member) {
  const flags = Array.isArray(task.flags)
    ? task.flags.filter((flag) => allowedTaskFlags.has(flag)).join(' ')
    : '';
  const accessLocked = taskRank(task).memberOnly && !member;
  const detail = accessLocked
    ? `<div class="member-lock"><strong>U-WORD会員限定</strong><span>詳細閲覧・応募には会員資格が必要です</span><a href="${routeHref('/me')}">会員条件を見る</a></div>`
    : `<a class="card-link" href="${routeHref(task.detailHref || `/tasks/${task.id}`)}">詳しい条件を見る・応募する</a>`;
  return `<article class="paper-card task-card" data-task-id="${escapeHtml(task.id)}" data-flags="${escapeHtml(flags)}">
    <span class="state-band">${escapeHtml(task.status)}</span>
    <div class="task-card-body">
      <p class="project-name">${escapeHtml(task.project)}</p>
      <div class="rank-row">${rankBadge(task)}</div>
      <h2 class="task-name">${escapeHtml(task.title)}</h2>
      <div class="money-pair">
        <div><span class="money-label">手取り見込</span><strong class="num take-home">${escapeHtml(task.takeHome)}</strong></div>
        <div><span class="money-label">実質時給見込</span><strong class="num hourly">${escapeHtml(task.hourly)}</strong></div>
      </div>
      <p class="money-note">ここからさらに引かれるものはありません</p>
      <ul class="fact-list">
        <li><span class="money-label">工数</span><strong class="num">${escapeHtml(task.hours)}</strong><br>${escapeHtml(task.pace)}</li>
        <li class="${task.urgent ? 'urgent' : ''}"><span class="money-label">締切</span><strong>${escapeHtml(task.deadline)}</strong></li>
        <li>${escapeHtml(task.applications)}</li>
        <li>${escapeHtml(task.slots)}</li>
      </ul>
      ${skillRequirement(task, accessLocked)}
      <p class="member-bonus">U-WORD会員になるとさらに <strong class="num">${escapeHtml(task.memberBonus)}</strong></p>
      ${detail}
    </div>
  </article>`;
}

function taskListScreen(data) {
  const member = isUwordMember(data);
  return `${pageHeader('SCREEN 01 / TASKS', '仕事を探す', 'AI系でよくある仕事を、難易度・工数・必要スキルと一緒に比較できます。')}
    <section aria-labelledby="task-controls-title">
      <h2 class="section-title" id="task-controls-title">並び順と条件</h2>
      <div class="controls">
        <div class="field field-grow">
          <label for="task-sort">並び替え</label>
          <select id="task-sort">
            <option value="hourly">実質時給が高い順</option>
            <option value="deadline">締切が近い順</option>
            <option value="hours">工数が少ない順</option>
            <option value="amount">手取りが高い順</option>
          </select>
        </div>
        <div class="field field-grow">
          <span class="field-label" id="condition-label">条件</span>
          <div class="chip-row" aria-labelledby="condition-label">
            <button class="chip" type="button" aria-pressed="false" data-filter="under10">10時間以内</button>
            <button class="chip" type="button" aria-pressed="false" data-filter="remote">在宅</button>
            <button class="chip" type="button" aria-pressed="false" data-filter="beginner">未経験可</button>
          </div>
        </div>
      </div>
    </section>
    <aside class="notice" aria-label="掲載案件について">
      <strong>AI仕事の参考例</strong>
      <p>2026年8月31日にクラウドワークス、ランサーズ等の募集傾向を調査して作成した40件の合成案件です。案件名にAI表記のない一般業務例は、発注者がAI利用を許可し、機密情報を外部AIへ送らない想定です。実在案件の転載ではなく、金額も相場保証ではありません。</p>
    </aside>
    <aside class="notice rank-guide" aria-label="仕事ランクについて">
      <strong>仕事ランクと閲覧条件</strong>
      <div class="rank-legend">${Object.entries(taskRankDefinitions).reverse().map(([rank, item]) => `<span><b class="rank-badge rank-${rank.toLowerCase()}">ランク ${rank}</b>${escapeHtml(item.label)}</span>`).join('')}</div>
      <p>重要性・難易度・責任の重さを総合して分類しています。ランクC・B・Aの詳細閲覧と応募はU-WORD会員限定です。ランクDは一般公開しています。</p>
    </aside>
    <aside class="notice skill-guide" aria-label="必要スキルの見方">
      <strong>必要スキルの見方</strong>
      <p>各仕事に、必須スキル・習熟目安・応募できる目安を表示しています。ツール名だけでなく、その仕事を自分で完了できるかで判断してください。</p>
    </aside>
    <div class="task-grid" id="task-grid">${data.tasks.map((task) => taskCard(task, member)).join('')}</div>
    <p class="empty-state" id="task-empty" hidden>この条件に合うタスクはありません。条件を外して確認してください。</p>`;
}

function taskDetailScreen(data) {
  const task = data.tasks[0];
  return `${pageHeader('SCREEN 02 / TASK DETAIL', task.project, task.title)}
    <aside class="notice rank-summary"><div class="rank-row">${rankBadge(task)}</div><p>${taskRank(task).memberOnly ? 'U-WORD会員限定の仕事です。' : 'すべての利用者が詳細を確認し、応募できます。'}</p></aside>
    <div class="section-stack">
      <section aria-labelledby="condition-title">
        <h2 class="section-title" id="condition-title">条件</h2>
        <div class="paper-card detail-card">
          <dl class="definition-list">
            <dt>手取り見込</dt><dd class="num take-home">${escapeHtml(task.takeHome)}</dd>
            <dt>実質時給見込</dt><dd class="num hourly">${escapeHtml(task.hourly)}</dd>
            <dt>工数</dt><dd><span class="num">${escapeHtml(task.hours)}</span>・${escapeHtml(task.pace)}</dd>
            <dt>締切</dt><dd class="urgent">${escapeHtml(task.deadline)}</dd>
            <dt>着手できる日</dt><dd>${escapeHtml(task.startDate || '応募承認後に調整')}</dd>
            <dt>引き渡し先</dt><dd>${escapeHtml(task.handoff || task.project)}</dd>
          </dl>
          <p class="money-note">ここからさらに引かれるものはありません</p>
        </div>
      </section>
      <section aria-labelledby="work-title">
        <h2 class="section-title" id="work-title">仕事の内容</h2>
        <div class="paper-card detail-card">
          <dl class="definition-list">
            <dt>成果物</dt><dd>${escapeHtml(task.deliverable || `${task.title}の成果物一式`)}</dd>
            <dt>完了条件</dt><dd>${escapeHtml(task.doneWhen || '指定された件数・形式を満たし、人による最終確認が完了していること')}</dd>
            <dt>対象外</dt><dd>${escapeHtml(task.scopeOut || '契約範囲外の追加作業、外部サービスへの無断登録、最終的な法的判断')}</dd>
          </dl>
        </div>
      </section>
      <section aria-labelledby="skills-title">
        <h2 class="section-title" id="skills-title">必要スキルと応募目安</h2>
        <div class="paper-card detail-card">${skillRequirement(task)}</div>
      </section>
      <section aria-labelledby="breakdown-title">
        <h2 class="section-title" id="breakdown-title">手取りの内訳</h2>
        <div class="paper-card balance-sheet">
          ${task.base ? `<div class="balance-row"><span>基本の手取り</span><strong class="num">${escapeHtml(task.base)}</strong></div>` : ''}
          <div class="balance-row"><span>会員上乗せ</span><strong class="num">${escapeHtml(task.memberBonus)}</strong></div>
          <div class="balance-row"><span>手取り見込</span><strong class="num take-home">${escapeHtml(task.takeHome)}</strong></div>
        </div>
      </section>
      ${task.legalTerms ? `<section aria-labelledby="terms-title">
        <h2 class="section-title" id="terms-title">契約条件</h2>
        <div class="paper-card detail-card"><dl class="definition-list">
          ${task.legalTerms.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}
        </dl></div>
      </section>` : ''}
      ${task.review ? `<section aria-labelledby="review-title">
        <h2 class="section-title" id="review-title">依頼人へのレビュー</h2>
        <blockquote class="notice">${escapeHtml(task.review)}</blockquote>
      </section>` : ''}
      <section aria-labelledby="application-title">
        <h2 class="section-title" id="application-title">応募する</h2>
        <form class="paper-card form-card" id="application-form" novalidate>
          <div class="field">
            <label for="application-message">応募理由をひとこと</label>
            <textarea id="application-message" name="message" required aria-describedby="application-hint application-error" placeholder="例：9月1日から着手できます"></textarea>
            <span class="field-hint" id="application-hint">依頼人に伝える短いメッセージです。</span>
            <span class="status-message error-message" id="application-error" role="alert"></span>
          </div>
        </form>
        <p class="notice notice-warning">応募しても確定ではありません。承認された時点で金額が確定し、以降変わりません。</p>
        <p class="status-message" id="application-status" role="status" aria-live="polite"></p>
      </section>
    </div>
    <div class="sticky-apply" aria-label="応募条件と操作">
      <div class="sticky-amount">
        <span>手取り見込 <strong class="num">${escapeHtml(task.takeHome)}</strong></span>
        <span>実質時給 <strong class="num">${escapeHtml(task.hourly)}</strong></span>
        <span>締切 <strong>${escapeHtml(task.deadline)}</strong></span>
      </div>
      <button class="button" id="open-application" type="button">応募内容を確認する</button>
      <p class="microcopy">入力はひとことだけ。1分で終わります</p>
    </div>
    <dialog id="application-dialog" aria-labelledby="confirmation-title">
      <h2 id="confirmation-title">応募内容の確認</h2>
      <p>次の内容で応募します。応募後も、承認されるまでは金額確定ではありません。</p>
      <div class="notice" id="confirmation-message"></div>
      <div class="button-row">
        <button class="button button-success" id="confirm-application" type="button">この内容で応募する</button>
        <button class="button button-secondary" id="cancel-application" type="button">修正する</button>
      </div>
    </dialog>`;
}

function lockedTaskScreen(data) {
  const task = data.tasks[0];
  return `${pageHeader(`MEMBERS ONLY / RANK ${task.rank}`, task.project, task.title)}
    <section class="paper-card membership-gate" aria-labelledby="membership-gate-title">
      <div class="rank-row">${rankBadge(task)}</div>
      <h2 id="membership-gate-title">詳細閲覧・応募はU-WORD会員限定です</h2>
      <p>ランクC以上の仕事は、担当品質と実績の確認が必要なため、U-WORD会員のみ詳細を確認できます。</p>
      <p class="notice">公開デモでは実会員認証や加入処理を行いません。実運用ではサーバー側で会員資格を確認し、非会員には詳細データ自体を返しません。</p>
      <div class="button-row">
        <a class="button button-secondary" role="button" href="${routeHref('/tasks')}">仕事一覧へ戻る</a>
        <a class="button" role="button" href="${routeHref('/me')}">会員条件を見る</a>
      </div>
    </section>`;
}

function myPageScreen(data) {
  const member = data.member;
  const notificationItems = member.notifications?.length
    ? member.notifications.map((notification) => `<li><strong>${escapeHtml(notification.label)}</strong><span>${escapeHtml(notification.createdAt)}</span></li>`).join('')
    : '<li><strong>新しい通知はありません。</strong></li>';
  const workItems = member.work.length ? member.work.map((work) => {
    const taskId = escapeHtml(work.taskId || '');
    const action = work.kind === 'application'
      ? '<button class="button button-danger" type="button" data-withdraw-application>応募を取り下げる</button>'
      : work.action === 'start'
      ? '<button class="button" type="button" data-task-action="start">着手する</button>'
      : work.action === 'submit' ? `<form class="delivery-form" data-delivery-form novalidate>
          <div class="field">
            <label for="delivery-url-${taskId}">納品URL</label>
            <input id="delivery-url-${taskId}" name="url" type="url" required placeholder="https://example.com/delivery">
          </div>
          <div class="field">
            <label for="delivery-description-${taskId}">納品内容</label>
            <textarea id="delivery-description-${taskId}" name="description" required></textarea>
          </div>
          <button class="button button-success" type="submit">納品する</button>
        </form>` : '';
    return `<li class="my-work-item" data-task-id="${taskId}" data-application-id="${escapeHtml(work.kind === 'application' ? work.id : '')}">
      <span class="state-text${work.state === '要対応' ? ' state-text-attention' : ''}">${escapeHtml(work.state)}</span>
      <strong>${escapeHtml(work.title)}</strong><span>${escapeHtml(work.meta)}</span>${action}
      <p class="status-message error-message" role="alert"></p>
    </li>`;
  }).join('') : '<li><strong>現在表示するタスクはありません。</strong></li>';
  const effortItems = (member.effortTargets || []).map((target) => {
    const taskId = escapeHtml(target.taskId);
    const activity = escapeHtml(target.activity);
    const fieldSuffix = `${taskId}-${activity}`;
    return `<li class="effort-item">
      <strong>${escapeHtml(target.projectTitle)} — ${escapeHtml(target.taskName)}</strong>
      <span>${target.activity === 'am_coordination' ? 'AM調整' : '担当作業'}・累計 <strong data-effort-total>${escapeHtml(target.totalMinutes)}分</strong></span>
      <form data-effort-form data-task-id="${taskId}" data-activity="${activity}" novalidate>
        <div class="field"><label for="effort-date-${fieldSuffix}">実働日</label><input id="effort-date-${fieldSuffix}" name="occurredOn" type="date" required></div>
        <div class="field"><label for="effort-minutes-${fieldSuffix}">実働時間（分）</label><input id="effort-minutes-${fieldSuffix}" name="minutes" type="number" min="1" max="1440" step="1" required></div>
        <div class="field"><label for="effort-note-${fieldSuffix}">作業メモ</label><input id="effort-note-${fieldSuffix}" name="note" required maxlength="1000"></div>
        <button class="button button-secondary" type="submit">実働を記録する</button>
        <p class="status-message" role="status" aria-live="polite"></p>
      </form>
    </li>`;
  }).join('');
  const pendingChanges = member.pendingChanges || [];
  return `${pageHeader('SCREEN 03 / MY PAGE', 'マイページ', `${member.name}・${member.membership}`)}
    <section aria-labelledby="member-summary-title">
      <h2 class="section-title" id="member-summary-title">今月の状況</h2>
      <div class="metric-grid">
        ${member.metrics.map((metric) => `<div class="metric"><span class="money-label">${escapeHtml(metric.label)}</span><strong class="num">${escapeHtml(metric.value)}</strong></div>`).join('')}
      </div>
      ${member.showMissedBonus === false ? '' : `<p class="member-bonus">加入していれば <strong class="num">${escapeHtml(member.missedBonus)}</strong> 多かった</p>`}
      ${member.missedBonusUnavailable ? '<p class="notice">契約変更または証跡確認中のため、加入時の正確な差額は表示していません。</p>' : ''}
    </section>
    <section aria-labelledby="my-work-title">
      <h2 class="section-title" id="my-work-title">自分のタスク</h2>
      <ul class="ruled-list">
        ${workItems}
      </ul>
    </section>
    <section aria-labelledby="notifications-title">
      <h2 class="section-title" id="notifications-title">通知</h2>
      <ul class="ruled-list">${notificationItems}</ul>
    </section>
    ${effortItems ? `<section aria-labelledby="effort-title">
      <h2 class="section-title" id="effort-title">実働を記録</h2>
      <ul class="ruled-list">${effortItems}</ul>
    </section>` : ''}
    <section aria-labelledby="consent-link-title">
      <h2 class="section-title" id="consent-link-title">確認が必要な変更</h2>
      ${pendingChanges.length ? pendingChanges.map((changeId) => `<div class="notice notice-warning">
        <strong>手取りまたは契約条件の変更依頼があります。</strong>
        <p><a href="${routeHref(`/changes/${escapeHtml(changeId)}`)}">変更内容を確認する</a></p>
      </div>`).join('') : '<p class="notice">現在、回答が必要な変更はありません。</p>'}
    </section>`;
}

function balanceRows(rows) {
  return rows.map((row) => `<div class="balance-row"><span>${escapeHtml(row.label)}</span><strong class="num">${escapeHtml(row.value)}</strong></div>`).join('');
}

const boardStatuses = [
  ['todo', '未着手'],
  ['doing', '進行中'],
  ['review', '確認待ち'],
  ['done', '完了'],
];
const boardStatusValues = new Set(boardStatuses.map(([value]) => value));

function projectBoardScreen(data) {
  const board = data.projectBoard;
  return `${pageHeader('MY PROJECT BOARD', 'プロジェクト管理', `${data.member.name}さん専用の進行管理ボードです。`)}
    <aside class="notice">
      <strong>自分のプロジェクトだけを表示</strong>
      <p>この公開デモでは変更をこのブラウザだけに保存します。本番ではログイン中の利用者IDでサーバー側の閲覧・更新権限を確認します。</p>
    </aside>
    <section class="project-board-header" aria-labelledby="board-title">
      <div>
        <span class="eyebrow">ACTIVE PROJECT</span>
        <h2 id="board-title">${escapeHtml(board.title)}</h2>
        <p>${escapeHtml(board.goal)}</p>
      </div>
      <a class="button button-secondary" role="button" href="${routeHref('/projects/project-1')}">契約・配分を見る</a>
    </section>
    <form class="paper-card board-task-form" id="board-task-form">
      <h2>タスクを追加</h2>
      <div class="board-task-fields">
        <div class="field"><label for="board-task-title">タスク名</label><input id="board-task-title" name="title" required maxlength="100" placeholder="例：初稿を確認する"></div>
        <div class="field"><label for="board-task-assignee">担当</label><input id="board-task-assignee" name="assignee" required maxlength="40" value="${escapeHtml(data.member.name)}"></div>
        <div class="field"><label for="board-task-start">開始日</label><input id="board-task-start" name="start" type="date" required></div>
        <div class="field"><label for="board-task-due">期限</label><input id="board-task-due" name="due" type="date" required></div>
        <button class="button" type="submit">未着手へ追加</button>
      </div>
      <p class="status-message" id="board-task-status" role="status" aria-live="polite"></p>
    </form>
    <div class="project-view-switcher" role="tablist" aria-label="プロジェクトの表示方法">
      <button type="button" role="tab" id="view-board-tab" aria-selected="true" aria-controls="project-view-board" data-project-view="board">ボード</button>
      <button type="button" role="tab" id="view-calendar-tab" aria-selected="false" aria-controls="project-view-calendar" data-project-view="calendar">カレンダー</button>
      <button type="button" role="tab" id="view-gantt-tab" aria-selected="false" aria-controls="project-view-gantt" data-project-view="gantt">ガントチャート</button>
    </div>
    <section class="project-view" id="project-view-board" role="tabpanel" aria-labelledby="view-board-tab" data-project-view-panel="board">
      <div class="kanban-board" id="kanban-board" aria-label="プロジェクト進捗">
        ${boardStatuses.map(([status, label]) => `<section class="kanban-column" data-board-column="${status}" aria-labelledby="column-${status}">
          <header><h2 id="column-${status}">${label}</h2><span class="board-count" data-board-count="${status}">0件</span></header>
          <ul data-board-list="${status}"></ul>
        </section>`).join('')}
      </div>
    </section>
    <section class="project-view" id="project-view-calendar" role="tabpanel" aria-labelledby="view-calendar-tab" data-project-view-panel="calendar" hidden>
      <header class="calendar-toolbar">
        <button class="button button-secondary" type="button" data-calendar-move="-1" aria-label="前の月">前月</button>
        <h2 id="calendar-title" aria-live="polite"></h2>
        <button class="button button-secondary" type="button" data-calendar-move="1" aria-label="次の月">次月</button>
      </header>
      <div class="calendar-scroll" tabindex="0" aria-label="月間カレンダー。横にスクロールできます">
        <div class="project-calendar" id="project-calendar"></div>
      </div>
    </section>
    <section class="project-view" id="project-view-gantt" role="tabpanel" aria-labelledby="view-gantt-tab" data-project-view-panel="gantt" hidden>
      <p class="gantt-summary" id="gantt-summary"></p>
      <div class="gantt-scroll" tabindex="0" aria-label="ガントチャート。横にスクロールできます">
        <div class="gantt-chart" id="gantt-chart"></div>
      </div>
    </section>`;
}

function projectScreen(data) {
  const project = data.project;
  return `${pageHeader('SCREEN 04 / PROJECT', project.title, `状態：${project.status}`)}
    <div class="admin-grid">
      <section aria-labelledby="pool-title">
        <h2 class="section-title" id="pool-title">未確定の原資</h2>
        <div class="metric metric-attention"><span class="money-label">追加・分割に使える上限</span><strong class="num take-home">${escapeHtml(project.unallocated)}</strong></div>
      </section>
      <section aria-labelledby="balance-title">
        <h2 class="section-title" id="balance-title">配分票と検印</h2>
        <div class="paper-card balance-sheet">
          ${balanceRows(project.balance)}
          ${project.balanced ? '<span class="stamp" aria-label="配分一致">合</span>' : '<p class="error-message">配分が一致していません。</p>'}
        </div>
      </section>
    </div>
    <section aria-labelledby="allocation-title">
      <h2 class="section-title" id="allocation-title">タスク別の配分</h2>
      <ul class="ruled-list">
        ${project.tasks.map((task) => `<li class="project-task" data-task-id="${escapeHtml(task.id || '')}">
          <span class="state-text${task.status === '金額確定' || task.status === '検収済み' ? ' state-text-ok' : ''}">${escapeHtml(task.status)}</span>
          <strong>${escapeHtml(task.title)}</strong><span class="num">${escapeHtml(task.amount)}</span>
          ${task.deliveryUrl ? `<p><a href="${escapeHtml(task.deliveryUrl)}" target="_blank" rel="noopener noreferrer">納品物を開く</a></p><p>${escapeHtml(task.deliveryDescription)}</p>` : ''}
          <p class="status-message" role="status" aria-live="polite"></p>
          ${task.reviewable ? `<div class="application-actions">
            <label class="check-row"><input type="checkbox" data-delivery-confirm> 納品物と説明を確認しました</label>
            <button class="button button-success" type="button" data-task-review="accept" disabled>検収する</button>
            <details>
              <summary>差戻し・仕様変更</summary>
              <form data-task-return novalidate>
                <div class="field"><label>区分<select name="kind"><option value="contract_nonconformity">契約条件の未達</option><option value="scope_change">後から増えた仕様変更</option></select></label></div>
                <div class="field"><label>理由<textarea name="reason" required></textarea></label></div>
                <div class="field"><label>未達の完了条件<input name="criterion" required></label></div>
                <button class="button button-danger" type="submit">差し戻す</button>
              </form>
            </details>
          </div>` : ''}
          ${task.paymentObligationId ? `<p class="notice">支払予定作成済み（期日 ${escapeHtml(task.paymentDueOn)}）</p>`
    : task.paymentPlannable ? `<form data-payment-obligation novalidate>
              <div class="field"><label>支払期日<input name="dueOn" type="date" required></label></div>
              <div class="field"><label>請求書・支払先確認メモ<input name="invoiceReference" required maxlength="500"></label></div>
              <div class="field"><label>保留理由（任意）<textarea name="holdReason" maxlength="2000"></textarea></label></div>
              <button class="button button-secondary" type="submit">支払予定を作成する</button>
            </form>` : ''}
        </li>`).join('')}
      </ul>
    </section>
    <section aria-labelledby="applications-title">
      <h2 class="section-title" id="applications-title">届いている応募</h2>
      <ul class="application-list">
        ${project.applications.map((application) => `<li class="application" data-application="${escapeHtml(application.id)}" data-task-id="${escapeHtml(application.taskId || '')}">
          <span class="state-text">${escapeHtml(application.status)}</span>
          <h3>${escapeHtml(application.name)} — ${escapeHtml(application.task)}</h3>
          <p>${escapeHtml(application.message)}</p>
          <p class="status-message" role="status" aria-live="polite"></p>
          ${application.actionable === false ? '' : `<div class="application-actions">
            <button class="button button-success" type="button" data-decision="approve">この応募を承認する</button>
            <button class="button button-danger" type="button" data-decision="decline">今回は見送る</button>
          </div>`}
        </li>`).join('')}
      </ul>
    </section>
    ${project.changeDraft?.workOrders.length ? `<section aria-labelledby="change-draft-title">
      <h2 class="section-title" id="change-draft-title">条件変更の提案</h2>
      <form class="paper-card form-card" data-change-request novalidate>
        <p>入力後は直ちに反映せず、影響する会員・管理者の確認待ちになります。</p>
        <div class="field"><label>変更後の受注額（円）
          <input name="nextGross" inputmode="numeric" pattern="0|[1-9][0-9]*" value="${escapeHtml(project.changeDraft.nextGross)}" required>
        </label></div>
        ${project.changeDraft.workOrders.map((workOrder, index) => `<fieldset class="field">
          <legend>${escapeHtml(workOrder.memberName)} — ${escapeHtml(workOrder.taskKey)}</legend>
          <label>変更操作 — ${escapeHtml(workOrder.taskKey)}
            <select data-change-action="${index}">
              <option value="replace">条件を変更／維持</option>
              <option value="reopen">担当解除して再募集</option>
              <option value="remove">担当解除して工程削除</option>
            </select>
          </label>
          <label>変更後の完了条件 — ${escapeHtml(workOrder.memberName)} — ${escapeHtml(workOrder.taskKey)}
            <textarea name="completion-${index}" data-change-completion="${index}" required>${escapeHtml(workOrder.completionCriteria)}</textarea>
          </label>
          <button class="button button-secondary" type="button" data-add-change-work-order="${index}">この工程から追加する — ${escapeHtml(workOrder.taskKey)}</button>
        </fieldset>`).join('')}
        <div class="section-stack" data-change-created-list></div>
        <button class="button button-secondary" type="submit">変更内容を確認する</button>
        <div class="notice" data-change-confirm hidden tabindex="-1">
          <h3>変更内容の確認</h3>
          <p data-change-gross></p>
          <ul data-change-summary></ul>
          <button class="button button-success" type="button" data-confirm-change>この内容で確認依頼を作成する</button>
        </div>
        <p class="status-message" role="status" aria-live="polite"></p>
      </form>
    </section>` : ''}
    <section aria-labelledby="progress-title">
      <h2 class="section-title" id="progress-title">工程の進捗</h2>
      <div class="paper-card detail-card check-list">
        ${project.steps.map((step, index) => `<label class="check-row"><input type="checkbox"${step.done ? ' checked' : ''}> <span>${index + 1}. ${escapeHtml(step.label)}</span></label>`).join('')}
      </div>
    </section>
    ${project.editHref === null ? '' : `<p><a class="button button-secondary" role="button" href="${routeHref(escapeHtml(project.editHref || '/projects/project-1/edit'))}">案件作成・配分確認へ</a></p>`}`;
}

function projectEditorScreen(data) {
  const editor = data.editor;
  return `${pageHeader('SCREEN 05 / PROJECT EDITOR', '案件作成・配分確認', '金額は入力値から計算せず、サーバー配信の合成プレビューを表示します。')}
    <form class="paper-card form-card" id="project-form" novalidate>
      <div class="section-stack">
        <div class="field">
          <label for="project-title">案件名</label>
          <input id="project-title" name="title" value="${escapeHtml(editor.defaultTitle)}" required aria-describedby="project-title-error">
          <span class="status-message error-message" id="project-title-error" role="alert"></span>
        </div>
        <div class="field">
          <label for="project-deliverable">成果物</label>
          <textarea id="project-deliverable" name="deliverable" required>${escapeHtml(editor.defaultDeliverable)}</textarea>
        </div>
        <div class="two-column">
          <div class="field">
            <label for="project-deadline">締切</label>
            <input id="project-deadline" name="deadline" type="date" value="${escapeHtml(editor.defaultDeadline)}" required>
          </div>
          <div class="field">
            <label for="allocation-template">配分fixture</label>
            <select id="allocation-template" name="allocation">
              ${editor.templates.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.label)}</option>`).join('')}
            </select>
          </div>
        </div>
        <fieldset class="detail-card">
          <legend>公開前の確認</legend>
          <label class="check-row"><input id="subcontracting" type="checkbox" required> 元契約の再委託許可を確認済み</label>
          <label class="check-row"><input id="funding" type="checkbox" required> 資金保全方法を人が確認済み</label>
        </fieldset>
        <p class="notice">このモックは公開・発注を行いません。配分プレビューの表示だけです。</p>
        <button class="button" type="submit">配分プレビューを表示する</button>
        <p class="status-message error-message" id="project-form-error" role="alert"></p>
      </div>
    </form>
    <section class="preview" id="allocation-preview" tabindex="-1" aria-labelledby="preview-title" aria-live="polite" hidden>
      <span class="eyebrow">LOCAL PREVIEW</span>
      <h2 id="preview-title">配分プレビュー</h2>
      <p><strong id="preview-project-title"></strong></p>
      <p id="preview-summary"></p>
      <div class="balance-sheet" id="preview-rows"></div>
      <p class="notice notice-success" id="preview-status"></p>
    </section>`;
}

function connectedProjectEditorScreen(data) {
  const options = data.editor;
  return `${pageHeader('SCREEN 05 / PROJECT EDITOR', '案件作成・配分確認', '下書き保存と配分プレビューまで行います。公開・発注は行いません。')}
    <form class="paper-card form-card" id="connected-project-form" novalidate>
      <div class="section-stack">
        <h2 class="section-title">案件条件</h2>
        <div class="two-column">
          <div class="field"><label>案件コード<input name="code" required maxlength="100"></label></div>
          <div class="field"><label>案件名<input name="title" required maxlength="200"></label></div>
          <div class="field"><label>顧客<select name="clientId" required>${options.clients.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join('')}</select></label></div>
          <div class="field"><label>AM担当<select name="amMemberId" required>${options.members.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.label)}</option>`).join('')}</select></label></div>
          <div class="field"><label>カテゴリ<input name="category" required maxlength="100"></label></div>
          <div class="field"><label>受注額（円）<input name="gross" inputmode="numeric" pattern="[0-9]+" required></label></div>
          <div class="field"><label>直接経費（円）<input name="directCost" inputmode="numeric" pattern="[0-9]+" value="0" required></label></div>
          <div class="field"><label>資金保全<select name="fundingStatus"><option value="secured">入金済み・確保済み</option><option value="association_guaranteed">協会保証</option><option value="unsecured">未確保</option></select></label></div>
        </div>
        <div class="field"><label>概要<textarea name="summary" required></textarea></label></div>
        <div class="field"><label>詳細<textarea name="details" required></textarea></label></div>
        <div class="field"><label>データ区分<input name="dataClassification" required value="synthetic"></label></div>
        <div class="field"><label>顧客名の開示条件<textarea name="customerNameDisclosure" required></textarea></label></div>
        <label class="check-row"><input name="subcontractingConfirmed" type="checkbox" required> 元契約の再委託許可を確認済み</label>
        <p class="notice">協会フィー15%・最低10%・紹介料0%をサーバー側で固定します。</p>
        <h2 class="section-title">最初のタスク</h2>
        <div class="two-column">
          <div class="field"><label>タスクキー<input name="taskKey" required maxlength="100"></label></div>
          <div class="field"><label>タスク名<input name="taskName" required maxlength="200"></label></div>
          <div class="field"><label>必要スキル（カンマ区切り）<input name="skills" required></label></div>
          <div class="field"><label>工数（時間）<input name="hours" type="number" min="5" max="10" step="0.5" required></label></div>
          <div class="field"><label>難易度<select name="difficultyX10"><option value="10">標準</option><option value="13">やや高い</option><option value="16">高い</option><option value="20">資格必須</option></select></label></div>
          <div class="field"><label>責任度<select name="responsibilityX10"><option value="10">標準</option><option value="12">確認責任あり</option><option value="14">最終責任あり</option></select></label></div>
          <div class="field"><label>納品形式<input name="deliveryFormat" required></label></div>
          <div class="field"><label>締切<input name="deadline" type="date" required></label></div>
        </div>
        <div class="field"><label>成果物<textarea name="deliverable" required></textarea></label></div>
        <div class="field"><label>作業範囲<textarea name="scope" required></textarea></label></div>
        <div class="field"><label>対象外<textarea name="exclusions" required></textarea></label></div>
        <div class="field"><label>完了条件<textarea name="completionCriteria" required></textarea></label></div>
        <div class="field"><label>不合格例<textarea name="rejectionExamples" required></textarea></label></div>
        <div class="field"><label>支給物<textarea name="suppliedMaterials" required></textarea></label></div>
        <details open><summary>修正・権利・AI利用条件（必須）</summary>
          <div class="field"><label>無償修正の範囲<textarea name="unpaidRevisionScope" required></textarea></label></div>
          <div class="field"><label>無償修正の上限回数<input name="unpaidRevisionLimit" type="number" min="0" step="1" required></label></div>
          <div class="field"><label>知的財産条件<textarea name="ipTerms" required></textarea></label></div>
          <div class="field"><label>AI利用条件<textarea name="aiUseTerms" required></textarea></label></div>
          <div class="field"><label>第三者素材条件<textarea name="thirdPartyMaterialsTerms" required></textarea></label></div>
          <div class="field"><label>中止条件<textarea name="cancellationTerms" required></textarea></label></div>
        </details>
        <button class="button" type="submit">下書き保存して配分を確認する</button>
        <p class="status-message error-message" id="connected-project-status" role="status" aria-live="polite"></p>
      </div>
    </form>
    <section class="preview" id="connected-allocation-preview" tabindex="-1" aria-labelledby="connected-preview-title" aria-live="polite" hidden>
      <span class="eyebrow">SERVER PREVIEW</span><h2 id="connected-preview-title">配分プレビュー</h2>
      <div class="balance-sheet" id="connected-preview-rows"></div>
      <p class="notice notice-success" id="connected-preview-status"></p>
      <p><a id="connected-project-link">下書き案件を確認する</a></p>
    </section>`;
}

function changeScreen(data) {
  const change = data.change;
  const actionable = change.actionable !== false;
  return `${pageHeader('SCREEN 06 / CHANGE CONSENT', '変更の承認', change.title)}
    <section aria-labelledby="delta-title">
      <span class="eyebrow" id="delta-title">あなたの手取りの増減</span>
      <p class="num change-delta">${escapeHtml(change.delta)}</p>
      <p>${escapeHtml(change.reason)}</p>
      <p class="notice notice-warning"><strong>回答期限：${escapeHtml(change.expires)}</strong><br>7日で失効します。沈黙は承認ではありません。</p>
    </section>
    <div class="two-column">
      <section aria-labelledby="before-title">
        <h2 class="section-title" id="before-title">現在の条件</h2>
        <div class="paper-card balance-sheet">${balanceRows(change.before)}</div>
      </section>
      <section aria-labelledby="after-title">
        <h2 class="section-title" id="after-title">変更後の条件</h2>
        <div class="paper-card balance-sheet">${balanceRows(change.after)}</div>
      </section>
    </div>
    <p class="notice"><strong>${escapeHtml(change.rejectEffect)}</strong></p>
    <section aria-labelledby="choice-title">
      <h2 class="section-title" id="choice-title">回答する</h2>
      ${actionable ? `<div class="change-choice">
        <button class="button button-success equal-weight" type="button" data-consent="approve">この変更を承認する</button>
        <button class="button button-danger equal-weight" type="button" data-consent="reject">この変更を拒否する</button>
        <button class="button button-secondary equal-weight" type="button" data-consent="consult" aria-controls="consult-panel" aria-expanded="false">相談する</button>
      </div>` : ''}
      <p class="status-message" id="consent-status" role="status" aria-live="polite" tabindex="-1">${escapeHtml(change.answerStatus || '')}</p>
      ${actionable ? `
      <form class="consult-panel" id="consult-panel" hidden>
        <div class="field">
          <label for="consult-message">相談したいこと</label>
          <textarea id="consult-message" required placeholder="例：作業範囲と締切について確認したいです"></textarea>
        </div>
        <button class="button button-secondary" type="submit">相談を記録する</button>
      </form>` : ''}
    </section>`;
}

function adminScreen(data) {
  const admin = data.admin;
  const payments = admin.payments || [];
  return `${pageHeader('SCREEN 07 / ADMIN', '管理', admin.description || '検算・会員同期・支払いをローカル合成データで確認します。')}
    <section aria-labelledby="admin-summary-title">
      <h2 class="section-title" id="admin-summary-title">全体の状態</h2>
      <div class="metric-grid">
        ${admin.summary.map((item) => `<div class="metric metric-${escapeHtml(item.state)}"><span class="money-label">${escapeHtml(item.label)}</span><strong class="num">${escapeHtml(item.value)}</strong><span class="state-text state-text-${escapeHtml(item.state)}">${item.state === 'ok' ? '正常' : '要確認'}</span></div>`).join('')}
      </div>
    </section>
    <section aria-labelledby="diagnostic-title">
      <h2 class="section-title" id="diagnostic-title">診断と支払い待ち</h2>
      <div class="controls">
        <div class="field field-grow">
          <label for="admin-filter">状態で絞り込む</label>
          <select id="admin-filter">
            <option value="all">すべて</option>
            <option value="ok">正常</option>
            <option value="attention">要確認</option>
          </select>
        </div>
        <p class="status-message" id="filter-status" role="status" aria-live="polite"></p>
      </div>
      <ul class="diagnostic-list" id="diagnostic-list">
        ${admin.diagnostics.map((item) => `<li class="diagnostic" data-state="${escapeHtml(item.state)}">
          <span class="status-mark state-text-${escapeHtml(item.state)}">${escapeHtml(item.status)}</span>
          <div><span class="eyebrow">${escapeHtml(item.kind)}</span><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail)}</p></div>
        </li>`).join('')}
      </ul>
    </section>
    <section aria-labelledby="payment-title">
      <h2 class="section-title" id="payment-title">手動支払記録</h2>
      ${payments.length ? `<ul class="ruled-list">${payments.map((payment) => `<li>
        <strong>${escapeHtml(payment.memberName)} — ${escapeHtml(payment.taskName)}</strong>
        <span class="num">${escapeHtml(payment.amount)}</span><p>期日 ${escapeHtml(payment.dueOn)} / ${escapeHtml(payment.projectTitle)}</p>
        <form data-payment-event data-obligation-id="${escapeHtml(payment.id)}" data-amount="${escapeHtml(payment.rawAmount)}" novalidate>
          <div class="field"><label>振込参照番号<input name="paymentReference" required maxlength="500"></label></div>
          <div class="field"><label>支払確認日時（日本時間）<input name="paidAt" type="datetime-local" step="60" required></label></div>
          <button class="button button-success" type="submit">支払済みを記録する</button>
          <p class="status-message" role="status" aria-live="polite"></p>
        </form>
      </li>`).join('')}</ul>` : '<p class="notice">支払い待ちはありません。</p>'}
    </section>
    <section aria-labelledby="share-title">
      <h2 class="section-title" id="share-title">掲載者別の割合</h2>
      <ul class="ruled-list">
        ${admin.ownerShares.map((owner) => `<li><span class="state-text state-text-${escapeHtml(owner.state)}">${escapeHtml(owner.status)}</span><strong>${escapeHtml(owner.name)}</strong><span class="num hourly">${escapeHtml(owner.share)}</span></li>`).join('')}
      </ul>
      <p class="notice notice-warning">1人が80%を超える場合は、市場として機能しているか確認します。</p>
    </section>
    <p class="footer-note">この画面から実決済・会員資格変更・外部同期は実行できません。</p>`;
}

const screens = {
  '/tasks': taskListScreen,
  '/tasks/task-1': taskDetailScreen,
  '/me': myPageScreen,
  '/projects': projectBoardScreen,
  '/projects/project-1': projectScreen,
  '/projects/project-1/edit': projectEditorScreen,
  '/changes/change-1': changeScreen,
  '/admin': adminScreen,
};

function initProjectBoard(data) {
  const board = document.querySelector('#kanban-board');
  const form = document.querySelector('#board-task-form');
  const statusMessage = form.querySelector('#board-task-status');
  const calendar = document.querySelector('#project-calendar');
  const gantt = document.querySelector('#gantt-chart');
  const viewSwitcher = document.querySelector('.project-view-switcher');
  const storageKey = `uai-project-board:${data.member.id || 'demo'}`;
  let tasks = data.projectBoard.tasks.map((task) => ({ ...task, start: task.start || task.due }));
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  const dayMs = 86_400_000;
  const dayNumber = (value) => {
    const [year, month, day] = value.split('-').map(Number);
    return Date.UTC(year, month - 1, day) / dayMs;
  };
  const dateFromDay = (value) => new Date(value * dayMs);
  const shortDate = new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'UTC' });
  const isIsoDate = (value) => {
    if (!datePattern.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
  };
  const taskIsValid = (task) => task
    && ['id', 'title', 'assignee', 'start', 'due', 'status'].every((key) => typeof task[key] === 'string')
    && task.id.length <= 100 && task.title.length <= 100 && task.assignee.length <= 40
    && isIsoDate(task.start) && isIsoDate(task.due) && task.start <= task.due
    && boardStatusValues.has(task.status);
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (Array.isArray(saved) && saved.length <= 100) {
      const migrated = saved.map((task) => ({ ...task, start: task?.start || task?.due }));
      if (migrated.every(taskIsValid)) tasks = migrated;
    }
  } catch {
    try { localStorage.removeItem(storageKey); } catch {}
  }
  let calendarMonth = (() => {
    const value = [...tasks].sort((a, b) => a.start.localeCompare(b.start))[0]?.start;
    if (value) {
      const [year, month] = value.split('-').map(Number);
      return new Date(year, month - 1, 1);
    }
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  })();

  const save = () => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(tasks));
      return true;
    } catch {
      statusMessage.textContent = 'このブラウザに保存できませんでした。空き容量と設定を確認してください。';
      return false;
    }
  };
  const renderBoard = () => {
    boardStatuses.forEach(([status]) => {
      const items = tasks.filter((task) => task.status === status);
      board.querySelector(`[data-board-count="${status}"]`).textContent = `${items.length}件`;
      board.querySelector(`[data-board-list="${status}"]`).innerHTML = items.map((task) => `<li class="kanban-task" data-board-task="${escapeHtml(task.id)}">
        <strong>${escapeHtml(task.title)}</strong>
        <span>担当：${escapeHtml(task.assignee)}</span>
        <span>期間：${escapeHtml(task.start)}〜${escapeHtml(task.due)}</span>
        <label>進捗
          <select data-board-status aria-label="${escapeHtml(task.title)}の進捗">
            ${boardStatuses.map(([value, label]) => `<option value="${value}"${value === task.status ? ' selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      </li>`).join('');
    });
  };
  const renderCalendar = () => {
    const year = calendarMonth.getFullYear();
    const month = calendarMonth.getMonth();
    const first = new Date(year, month, 1);
    const cells = Math.ceil((first.getDay() + new Date(year, month + 1, 0).getDate()) / 7) * 7;
    document.querySelector('#calendar-title').textContent = `${year}年${month + 1}月`;
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'].map((day) => `<div class="calendar-weekday">${day}</div>`).join('');
    const days = Array.from({ length: cells }, (_, index) => {
      const date = new Date(year, month, index - first.getDay() + 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const serial = dayNumber(key);
      const items = tasks.filter((task) => dayNumber(task.start) <= serial && serial <= dayNumber(task.due));
      return `<div class="calendar-day${date.getMonth() === month ? '' : ' calendar-day-outside'}">
        <time datetime="${key}">${date.getDate()}</time>
        <ul>${items.map((task) => `<li class="status-${task.status}" title="${escapeHtml(task.start)}〜${escapeHtml(task.due)}">${escapeHtml(task.title)}</li>`).join('')}</ul>
      </div>`;
    }).join('');
    calendar.innerHTML = weekdays + days;
  };
  const renderGantt = () => {
    if (!tasks.length) {
      gantt.innerHTML = '<p class="notice">表示するタスクがありません。</p>';
      return;
    }
    const startDay = Math.min(...tasks.map((task) => dayNumber(task.start)));
    const endDay = Math.max(...tasks.map((task) => dayNumber(task.due)));
    const totalDays = endDay - startDay + 1;
    const markerStep = Math.max(1, Math.ceil(totalDays / 10));
    const markers = Array.from({ length: Math.ceil(totalDays / markerStep) }, (_, index) => index * markerStep)
      .map((offset) => `<span style="left:${offset / totalDays * 100}%">${shortDate.format(dateFromDay(startDay + offset))}</span>`).join('');
    document.querySelector('#gantt-summary').textContent = `${shortDate.format(dateFromDay(startDay))}〜${shortDate.format(dateFromDay(endDay))}・全${tasks.length}タスク`;
    gantt.style.minWidth = `${Math.min(2400, Math.max(720, totalDays * 32))}px`;
    gantt.innerHTML = `<div class="gantt-axis"><span>タスク</span><div>${markers}</div></div>${tasks.map((task) => {
      const offset = dayNumber(task.start) - startDay;
      const duration = dayNumber(task.due) - dayNumber(task.start) + 1;
      return `<div class="gantt-row">
        <div class="gantt-label"><strong>${escapeHtml(task.title)}</strong><span>${escapeHtml(task.assignee)}</span></div>
        <div class="gantt-track"><span class="gantt-bar status-${task.status}" role="img" aria-label="${escapeHtml(task.title)}、${escapeHtml(task.start)}から${escapeHtml(task.due)}" style="left:${offset / totalDays * 100}%;width:${duration / totalDays * 100}%"></span></div>
      </div>`;
    }).join('')}`;
  };
  const render = () => {
    renderBoard();
    renderCalendar();
    renderGantt();
  };

  const setView = (view, focus = false) => {
    viewSwitcher.querySelectorAll('[data-project-view]').forEach((button) => {
      const selected = button.dataset.projectView === view;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      if (selected && focus) button.focus();
    });
    document.querySelectorAll('[data-project-view-panel]').forEach((panel) => {
      panel.hidden = panel.dataset.projectViewPanel !== view;
    });
  };
  viewSwitcher.addEventListener('click', (event) => {
    const button = event.target.closest('[data-project-view]');
    if (button) setView(button.dataset.projectView);
  });
  viewSwitcher.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...viewSwitcher.querySelectorAll('[data-project-view]')];
    const index = buttons.indexOf(document.activeElement);
    const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    setView(next.dataset.projectView, true);
  });
  document.querySelector('.calendar-toolbar').addEventListener('click', (event) => {
    const button = event.target.closest('[data-calendar-move]');
    if (!button) return;
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + Number(button.dataset.calendarMove), 1);
    renderCalendar();
  });

  board.addEventListener('change', (event) => {
    const select = event.target.closest('[data-board-status]');
    if (!select) return;
    const task = tasks.find((item) => item.id === select.closest('[data-board-task]').dataset.boardTask);
    if (!task) return;
    task.status = select.value;
    if (save()) statusMessage.textContent = '進捗を保存しました。';
    render();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.checkValidity()) return form.reportValidity();
    const values = new FormData(form);
    const title = values.get('title').trim();
    const assignee = values.get('assignee').trim();
    if (!title || !assignee) {
      statusMessage.textContent = 'タスク名と担当を入力してください。';
      return;
    }
    const start = values.get('start');
    const due = values.get('due');
    if (start > due) {
      statusMessage.textContent = '期限は開始日以降にしてください。';
      return;
    }
    tasks.push({ id: crypto.randomUUID(), title, assignee, start, due, status: 'todo' });
    const saved = save();
    render();
    form.elements.title.value = '';
    form.elements.start.value = '';
    form.elements.due.value = '';
    if (saved) statusMessage.textContent = '未着手にタスクを追加しました。';
    form.elements.title.focus();
  });
  setView('board');
  render();
}

function initTaskList(data) {
  const grid = document.querySelector('#task-grid');
  const empty = document.querySelector('#task-empty');
  const filters = new Set();
  const cards = new Map([...grid.querySelectorAll('.task-card')]
    .map((card) => [card.dataset.taskId, card]));

  function update() {
    const order = data.taskOrders[document.querySelector('#task-sort').value];
    order.forEach((id) => {
      const card = cards.get(String(id));
      if (card) grid.append(card);
    });
    let visible = 0;
    grid.querySelectorAll('.task-card').forEach((card) => {
      const flags = new Set(card.dataset.flags.split(' '));
      card.hidden = [...filters].some((filter) => !flags.has(filter));
      if (!card.hidden) visible += 1;
    });
    empty.hidden = visible !== 0;
  }

  document.querySelector('#task-sort').addEventListener('change', update);
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => {
    const enabled = button.getAttribute('aria-pressed') !== 'true';
    button.setAttribute('aria-pressed', String(enabled));
    enabled ? filters.add(button.dataset.filter) : filters.delete(button.dataset.filter);
    update();
  }));
  update();
}

function initTaskDetail({ connected = false, taskId = '' } = {}) {
  const pending = new WeakMap();
  const message = document.querySelector('#application-message');
  const error = document.querySelector('#application-error');
  const dialog = document.querySelector('#application-dialog');
  const openButton = document.querySelector('#open-application');
  const status = document.querySelector('#application-status');

  openButton.addEventListener('click', () => {
    if (!message.value.trim()) {
      message.setAttribute('aria-invalid', 'true');
      error.textContent = '応募理由を入力してください。';
      message.focus();
      return;
    }
    message.removeAttribute('aria-invalid');
    error.textContent = '';
    document.querySelector('#confirmation-message').textContent = message.value.trim();
    dialog.showModal();
  });

  document.querySelector('#cancel-application').addEventListener('click', () => dialog.close());
  document.querySelector('#confirm-application').addEventListener('click', async () => {
    dialog.close();
    if (connected) {
      openButton.disabled = true;
      status.textContent = '応募を送信しています…';
      try {
        const command = pendingCommand(pending, openButton, `application-${taskId}`,
          'タスク詳細画面から応募', { message: message.value.trim() });
        const response = await apiFetch(`/api/tasks/${encodeURIComponent(taskId)}/applications`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-request-id': command.requestId },
          body: JSON.stringify(command.body),
        });
        if (!response.ok) throw new Error(String(response.status));
      } catch (error) {
        status.textContent = error.message === '409'
          ? 'このタスクにはすでに応募済みです。'
          : '応募を送信できませんでした。時間をおいて再度お試しください。';
        openButton.disabled = false;
        return;
      }
    }
    status.textContent = '応募済み。依頼人の承認を待っています。';
    openButton.textContent = '応募済み';
    openButton.disabled = true;
    message.disabled = true;
  });
  message.addEventListener('input', () => pending.delete(openButton));
}

function formatYen(value) {
  try { return yen.format(BigInt(value)); } catch { return '—'; }
}

function formatDate(value) {
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日` : String(value);
}

function connectedTask(task) {
  return {
    id: task.id,
    detailHref: `/tasks/${encodeURIComponent(task.id)}`,
    project: task.projectTitle,
    title: task.name,
    status: '募集中',
    takeHome: formatYen(task.takeHomeEstimate),
    hourly: formatYen(task.effectiveHourlyRate),
    hours: `${task.effortHours}時間`,
    pace: 'サーバー算定値',
    deadline: formatDate(task.deadline),
    urgent: false,
    skills: Array.isArray(task.skills) ? task.skills : [],
    applications: `応募 ${task.applicationCount}件`,
    slots: '募集枠は掲載者が確認',
    memberBonus: `${BigInt(task.membershipBonusEstimate || '0') > 0n ? '+' : ''}${formatYen(task.membershipBonusEstimate)}`,
    flags: task.effortHours <= 10 ? ['under10'] : [],
    startDate: '応募承認後に調整',
    handoff: task.projectTitle,
    deliverable: task.deliveryFormat ? `${task.deliverable}（${task.deliveryFormat}）` : task.deliverable,
    doneWhen: task.completionCriteria,
    scopeOut: task.exclusions,
    legalTerms: task.ipTerms ? [
      ['無償修正', `${task.unpaidRevisionScope}（上限 ${task.unpaidRevisionLimit}回）`],
      ['知的財産', task.ipTerms],
      ['AI利用', task.aiUseTerms],
      ['第三者素材', task.thirdPartyMaterialsTerms],
      ['中止条件', task.cancellationTerms],
    ] : undefined,
  };
}

function connectedListData(tasks) {
  const compareMoney = (field) => [...tasks].sort((left, right) => {
    const a = BigInt(left[field]);
    const b = BigInt(right[field]);
    return a === b ? 0 : a > b ? -1 : 1;
  }).map((task) => task.id);
  return {
    meta: {
      label: 'LOCAL CONNECTED / 合成DB',
      notice: 'ローカルPostgreSQLと接続中です。外部API、実決済、会員資格の変更は行いません。',
      projectHref: tasks[0] ? `/projects/${encodeURIComponent(tasks[0].projectId)}` : undefined,
    },
    tasks: tasks.map(connectedTask),
    taskOrders: {
      hourly: compareMoney('effectiveHourlyRate'),
      deadline: [...tasks].sort((a, b) => a.deadline.localeCompare(b.deadline)).map((task) => task.id),
      hours: [...tasks].sort((a, b) => a.effortHours - b.effortHours).map((task) => task.id),
      amount: compareMoney('takeHomeEstimate'),
    },
  };
}

function connectedProjectData(project, changeDraft = null) {
  const statusLabel = { draft: '下書き', open: '募集中', active: '進行中', review: '検収中', closed: '完了' };
  const taskStatus = {
    open: '未確定', assigned: '金額確定', in_progress: '進行中', submitted: '検収待ち',
    accepted: '検収済み', released: '解除済み', revision_requested: '差戻し',
    scope_change_pending: '変更確認中',
  };
  const applicationStatus = { pending: '選考中', approved: '承認済み', declined: '見送り', withdrawn: '取下げ' };
  return {
    meta: { ...connectedListData([]).meta, projectHref: `/projects/${encodeURIComponent(project.id)}` },
    project: {
      id: project.id,
      title: project.title,
      status: statusLabel[project.status] || project.status,
      unallocated: formatYen(project.balance.availablePool),
      balance: [
        { label: '支給', value: formatYen(project.balance.payout) },
        { label: '紹介', value: formatYen(project.balance.referral) },
        { label: 'フィー', value: formatYen(project.balance.systemFee) },
        { label: '未配分', value: formatYen(project.balance.unallocated) },
        { label: '原資', value: formatYen(project.balance.net) },
      ],
      balanced: true,
      tasks: project.tasks.map((task) => ({
        id: task.id, title: task.name, amount: formatYen(task.amount),
        status: taskStatus[task.status] || task.status,
        deliveryUrl: task.deliveryUrl, deliveryDescription: task.deliveryDescription,
        reviewable: task.status === 'submitted' && Boolean(task.deliveryUrl && task.deliveryDescription),
        paymentObligationId: task.paymentObligationId,
        paymentDueOn: task.paymentDueOn ? formatDate(task.paymentDueOn) : '',
        paymentPlannable: task.status === 'accepted' && !task.paymentObligationId,
      })),
      applications: project.applications.map((application) => ({
        id: application.id, taskId: application.taskId, name: application.applicantName,
        task: application.taskName, message: application.message,
        status: applicationStatus[application.status] || application.status,
        actionable: application.status === 'pending',
      })),
      changeDraft: changeDraft ? {
        ...changeDraft,
        workOrders: changeDraft.workOrders.map((workOrder) => ({
          ...workOrder,
          completionCriteria: workOrder.terms?.taskTerms?.completionCriteria || '',
        })),
      } : null,
      steps: project.tasks.map((task) => ({ label: task.name, done: task.status === 'accepted' })),
      editHref: '/projects/new',
    },
  };
}

function connectedAdminData(projects, diagnostics) {
  const projectsById = new Map(projects.map((project) => [project.id, project]));
  const diagnosticsById = new Map(diagnostics.map((item) => [item.projectId, item]));
  const pendingProjects = projects.filter((project) => project.status === 'draft' && !project.hasAllocationSnapshot);
  const integrityFailures = diagnostics.filter((item) => item.snapshotDiff !== '0' || !item.runReproducible);
  const rosterFresh = diagnostics.length > 0 && diagnostics.every((item) => item.rosterFresh);
  const unpaidCount = diagnostics.reduce((total, item) => total + (Array.isArray(item.unpaid) ? item.unpaid.length : 0), 0);
  const overdueCount = diagnostics.reduce((total, item) => total + (Array.isArray(item.overdueSoon) ? item.overdueSoon.length : 0), 0);
  const blockedCount = diagnostics.filter((item) => item.moneyOperationsBlocked).length;
  const unsentOutboxCount = diagnostics[0]?.unsentOutboxCount || 0;
  const pilot = diagnostics.map((item) => item.pilotMetrics).filter(Boolean);
  const pilotTaskCount = pilot.reduce((total, item) => total + Number(item.taskCount || 0), 0);
  const pilotAmMinutes = pilot.reduce((total, item) => total + Number(item.amMinutes || 0), 0);
  const pilotApplications = pilot.reduce((total, item) => total + Number(item.applicationCount || 0), 0);
  const pilotApprovals = pilot.reduce((total, item) => total + Number(item.approvedApplicationCount || 0), 0);
  const effortLoggedTasks = pilot.reduce((total, item) => total + Number(item.effortLoggedTaskCount || 0), 0);
  const acceptanceDeadlineConfigured = pilot.length > 0
    && pilot.every((item) => item.acceptanceDeadlineConfigured);
  const seenOwners = new Set();
  return {
    meta: {
      ...connectedListData([]).meta,
      projectHref: null,
    },
    admin: {
      description: `監査対象${diagnostics.length}案件・未検算${pendingProjects.length}案件の保存則・同期・支払いを実データで確認します。`,
      summary: [
        { label: '検算', value: integrityFailures.length ? `${integrityFailures.length}件要確認` : diagnostics.length ? `全${diagnostics.length}件一致` : '対象なし', state: integrityFailures.length ? 'attention' : 'ok' },
        { label: '会員名簿同期', value: diagnostics.length ? (rosterFresh ? '24時間以内' : '期限超過') : '対象なし', state: diagnostics.length && !rosterFresh ? 'attention' : 'ok' },
        { label: '支払い待ち', value: `${unpaidCount}件`, state: unpaidCount ? 'attention' : 'ok' },
        { label: '金額操作停止', value: blockedCount ? `${blockedCount}件` : '0件', state: blockedCount ? 'attention' : 'ok' },
        { label: 'AM実働/タスク', value: pilotTaskCount && pilotAmMinutes
          ? `${(pilotAmMinutes / pilotTaskCount / 60).toFixed(2)}時間` : '未記録',
        state: pilotTaskCount && pilotAmMinutes ? 'ok' : 'attention' },
        { label: '応募試行成立率', value: pilotApplications
          ? `${(100 * pilotApprovals / pilotApplications).toFixed(1)}%` : '対象なし',
        state: pilotApplications ? 'ok' : 'attention' },
        { label: '実工数記録', value: `${effortLoggedTasks}/${pilotTaskCount}タスク`,
        state: pilotTaskCount > 0 && effortLoggedTasks === pilotTaskCount ? 'ok' : 'attention' },
        { label: '期限内検収率', value: acceptanceDeadlineConfigured ? '集計済み' : '基準未設定',
        state: acceptanceDeadlineConfigured ? 'ok' : 'attention' },
      ],
      diagnostics: [
        ...diagnostics.map((item) => {
          const ok = item.snapshotDiff === '0' && item.runReproducible;
          return { kind: '検算', title: projectsById.get(item.projectId)?.title || item.projectId, detail: `差額 ${formatYen(item.snapshotDiff)}・engine ${item.engineVersion}`, state: ok ? 'ok' : 'attention', status: ok ? '正常' : '要確認' };
        }),
        ...pendingProjects.map((project) => ({ kind: '未検算', title: project.title, detail: '下書きのため配分スナップショット未作成', state: 'ok', status: '下書き' })),
        { kind: '同期', title: 'U-Word会員名簿', detail: diagnostics.length ? (rosterFresh ? '最終同期は24時間以内です' : '最終同期から24時間を超えています') : '監査対象案件はありません', state: diagnostics.length && !rosterFresh ? 'attention' : 'ok', status: diagnostics.length && !rosterFresh ? '要確認' : '正常' },
        { kind: '支払い', title: `未払い ${unpaidCount}件`, detail: `7日以内の期日 ${overdueCount}件`, state: unpaidCount ? 'attention' : 'ok', status: unpaidCount ? '要確認' : '正常' },
        { kind: '通知', title: `outbox未送信 ${unsentOutboxCount}件`, detail: '通知失敗は金額処理を取り消しません', state: unsentOutboxCount ? 'attention' : 'ok', status: unsentOutboxCount ? '要確認' : '正常' },
      ],
      ownerShares: projects.flatMap((project) => {
        if (seenOwners.has(project.ownerId)) return [];
        seenOwners.add(project.ownerId);
        const diagnosticProject = projects.find((candidate) => candidate.ownerId === project.ownerId && diagnosticsById.has(candidate.id));
        if (!diagnosticProject) return [];
        const share = Number(diagnosticsById.get(diagnosticProject.id)?.ownerConcentrationBp) || 0;
        return [{ name: project.ownerName, share: `${(share / 100).toFixed(share % 100 ? 2 : 0)}%`, state: share > 8_000 ? 'warning' : 'ok', status: share > 8_000 ? '集中警告' : '確認済み' }];
      }),
      payments: diagnostics.flatMap((item) => (Array.isArray(item.unpaid) ? item.unpaid : []).map((payment) => ({
        id: payment.paymentObligationId, rawAmount: payment.amount, amount: formatYen(payment.amount),
        dueOn: formatDate(payment.dueOn), taskName: payment.taskName || payment.taskId,
        memberName: payment.memberName || payment.memberId,
        projectTitle: projectsById.get(item.projectId)?.title || item.projectId,
      }))),
    },
  };
}

function connectedMyData(dashboard) {
  const statusLabel = {
    assigned: '着手待ち', revision_requested: '要対応', in_progress: '進行中',
    submitted: '検収待ち', accepted: '検収済み', scope_change_pending: '変更確認中',
    released: '解除済み', pending: '応募中',
  };
  const membershipLabel = { none: '未加入', uword: 'U-Word会員', uword_uai: 'U-Word・U-AI会員' };
  const notificationLabel = {
    'application.received': '応募を受け付けました',
    'application.approved': '応募が採用されました',
    'application.declined': '応募は今回は見送りとなりました',
    'task.deadline_alert': 'タスクの納期が近づいています',
    'task.submitted': '納品が届きました',
    'task.revision_requested': '納品が差し戻されました',
    'task.scope_change_requested': '仕様変更の確認が必要です',
    'task.accepted': '納品が検収されました',
    'change_request.consent_requested': '条件変更への同意依頼があります',
    'change_request.expiry_alert': '条件変更の回答期限が近づいています',
    'payment_obligation.created': '支払予定が作成されました',
    'payment_obligation.deadline_alert': '支払期日が近づいています',
    'payment_event.recorded': '支払記録が更新されました',
  };
  const pendingChanges = [...new Set(dashboard.work.flatMap((work) => work.changeRequestIds || []))];
  const missedBonus = dashboard.missedBonus == null ? null : BigInt(dashboard.missedBonus);
  return {
    meta: { ...connectedListData([]).meta, projectHref: null },
    member: {
      name: dashboard.member.name,
      membership: membershipLabel[dashboard.member.membership] || dashboard.member.membership,
      metrics: [
        { label: '確定報酬', value: formatYen(dashboard.metrics.confirmedReward) },
        { label: '今月着手の想定工数', value: `${dashboard.metrics.currentMonthHours}時間` },
        { label: '想定平均時給', value: formatYen(dashboard.metrics.averageHourly) },
        { label: '応募中', value: `${dashboard.metrics.pendingApplications}件` },
      ],
      missedBonus: missedBonus != null ? formatYen(missedBonus) : '',
      showMissedBonus: missedBonus != null && missedBonus > 0n,
      missedBonusUnavailable: dashboard.member.membership === 'none' && missedBonus == null,
      pendingChanges,
      notifications: (dashboard.notifications || []).map((notification) => ({
        label: notificationLabel[notification.topic] || '案件の状況が更新されました',
        createdAt: new Intl.DateTimeFormat('ja-JP', {
          dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Tokyo',
        }).format(new Date(notification.createdAt)),
      })),
      effortTargets: (dashboard.effortTargets || []).map((target) => ({
        taskId: target.taskId,
        projectTitle: target.projectTitle,
        taskName: target.taskName,
        activity: target.activity,
        totalMinutes: target.totalMinutes,
      })),
      work: dashboard.work.map((work) => ({
        id: work.id, kind: work.kind, taskId: work.taskId, action: work.action,
        state: statusLabel[work.status] || work.status,
        title: `${work.projectTitle} — ${work.taskName}`,
        meta: `${work.lockedAmount ? `${formatYen(work.lockedAmount)}・` : ''}${work.effortHours}時間・締切 ${formatDate(work.deadline)}`,
      })),
    },
  };
}

function connectedChangeData(change) {
  const labels = {
    name: 'タスク', deliverable: '成果物', deliveryFormat: '納品形式', scope: '対象範囲',
    exclusions: '対象外', completionCriteria: '完了条件', rejectionExamples: '不合格例',
    deadline: '締切', unpaidRevisionScope: '無償修正範囲', unpaidRevisionLimit: '無償修正回数',
    ipTerms: '知財', aiUseTerms: 'AI利用', thirdPartyMaterialsTerms: '第三者素材',
    cancellationTerms: '取消条件', skills: '必要スキル', hoursX10: '想定工数',
    difficultyX10: '難易度', responsibilityX10: '責任度', count: '件数',
    suppliedMaterials: '提供素材', action: '変更操作', taskKey: 'タスクキー',
    memberId: '担当者ID', assignmentId: 'アサインID', taskId: 'タスクID',
    releaseMode: '解放後の扱い', lockedBase: '基本手取り', lockedBonus: '追加手取り',
  };
  const before = [];
  const after = [];
  const display = (value, key) => value == null || value === '' ? 'なし'
    : ['lockedBase', 'lockedBonus'].includes(key) ? formatYen(BigInt(value))
    : Array.isArray(value) ? value.join('、') : typeof value === 'object' ? JSON.stringify(value) : String(value);
  const flatten = (value, prefix = '', result = {}) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, result);
    } else if (prefix) result[prefix] = value;
    return result;
  };
  for (const item of change.changes) {
    const oldTerms = item.before?.terms?.taskTerms || {};
    const newTerms = item.after?.terms?.taskTerms || {};
    const taskName = newTerms.name || oldTerms.name || item.after?.taskKey || item.before?.taskKey || '対象タスク';
    const oldAmount = BigInt(item.before?.lockedBase || 0) + BigInt(item.before?.lockedBonus || 0);
    const newAmount = item.after?.action === 'release' ? 0n
      : BigInt(item.after?.lockedBase || 0) + BigInt(item.after?.lockedBonus || 0);
    if (oldAmount !== newAmount) {
      before.push({ label: `${taskName}／手取り`, value: formatYen(oldAmount) });
      after.push({ label: `${taskName}／手取り`, value: formatYen(newAmount) });
    }
    const oldValues = flatten(item.before);
    const newValues = flatten(item.after);
    for (const path of new Set([...Object.keys(oldValues), ...Object.keys(newValues)])) {
      if (JSON.stringify(oldValues[path]) === JSON.stringify(newValues[path])) continue;
      const key = path.split('.').at(-1);
      const label = labels[key] || path;
      before.push({ label: `${taskName}／${label}`, value: display(oldValues[path], key) });
      after.push({ label: `${taskName}／${label}`, value: display(newValues[path], key) });
    }
  }
  if (!before.length) {
    before.push({ label: '現在', value: '既存の発注条件' });
    after.push({ label: '変更後', value: '変更証跡を確認してください' });
  }
  const delta = BigInt(change.amountDelta);
  const answerStatus = change.decision === 'approved' ? 'この変更は承認済みです。'
    : change.decision === 'rejected' ? 'この変更は拒否済みです。現在の条件を維持します。'
      : change.status !== 'pending' ? `この変更は${change.status}です。` : '';
  return {
    meta: { ...connectedListData([]).meta, projectHref: null },
    change: {
      title: change.projectTitle, delta: `${delta > 0n ? '+' : ''}${formatYen(delta)}`,
      reason: change.reason, expires: formatDate(String(change.expiresAt).slice(0, 10)),
      before, after, rejectEffect: '拒否すると現在の金額・条件を維持します。',
      actionable: change.status === 'pending' && change.decision == null, answerStatus,
    },
  };
}

const connectedUnavailableScreen = () => `${pageHeader('CONNECTED MODE', 'この画面はまだ接続されていません')}
  <p class="notice notice-warning" role="status">案件作成と変更同意は、次の接続工程です。</p>`;

function initMyPage({ connected = false } = {}) {
  if (!connected) return;
  const pending = new WeakMap();
  document.querySelectorAll('[data-withdraw-application]').forEach((button) => button.addEventListener('click', async () => {
    const work = button.closest('.my-work-item');
    const status = work.querySelector('.status-message');
    button.disabled = true;
    work.setAttribute('aria-busy', 'true');
    status.textContent = '応募を取り下げています…';
    try {
      const command = pendingCommand(pending, button, `withdraw-${work.dataset.applicationId}`,
        'マイページから応募を取り下げ');
      const response = await apiFetch(`/api/applications/${encodeURIComponent(work.dataset.applicationId)}/withdraw`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': command.requestId },
        body: JSON.stringify(command.body),
      });
      if (!response.ok) throw new Error(String(response.status));
      work.remove();
    } catch {
      status.textContent = '応募を取り下げられませんでした。状態を更新して再度お試しください。';
      button.disabled = false;
      work.removeAttribute('aria-busy');
    }
  }));
  document.querySelectorAll('[data-task-action="start"]').forEach((button) => button.addEventListener('click', async () => {
    const work = button.closest('.my-work-item');
    const status = work.querySelector('.status-message');
    button.disabled = true;
    work.setAttribute('aria-busy', 'true');
    status.textContent = '着手処理中です…';
    try {
      const command = pendingCommand(pending, button, `start-${work.dataset.taskId}`,
        'マイページから担当タスクへ着手');
      const response = await apiFetch(`/api/tasks/${encodeURIComponent(work.dataset.taskId)}/start`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': command.requestId },
        body: JSON.stringify(command.body),
      });
      if (!response.ok) throw new Error(String(response.status));
      location.reload();
    } catch {
      status.textContent = '着手できませんでした。状態を更新して再度お試しください。';
      button.disabled = false;
      work.removeAttribute('aria-busy');
    }
  }));
  document.querySelectorAll('[data-delivery-form]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) return form.reportValidity();
    const work = form.closest('.my-work-item');
    const button = form.querySelector('button[type="submit"]');
    const status = work.querySelector('.status-message');
    button.disabled = true;
    work.setAttribute('aria-busy', 'true');
    status.textContent = '納品処理中です…';
    try {
      const command = pendingCommand(pending, form, `submit-${work.dataset.taskId}`,
        'マイページから成果物を納品', {
          url: form.elements.url.value.trim(), description: form.elements.description.value.trim(),
        });
      const response = await apiFetch(`/api/tasks/${encodeURIComponent(work.dataset.taskId)}/submit`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': command.requestId },
        body: JSON.stringify(command.body),
      });
      if (!response.ok) throw new Error(String(response.status));
      location.reload();
    } catch {
      status.textContent = '納品できませんでした。URL・内容・現在の状態を確認してください。';
      button.disabled = false;
      work.removeAttribute('aria-busy');
    }
  }));
  document.querySelectorAll('[data-delivery-form]').forEach((form) =>
    form.addEventListener('input', () => pending.delete(form)));
  document.querySelectorAll('[data-effort-form]').forEach((form) => {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) return form.reportValidity();
      const button = form.querySelector('button[type="submit"]');
      const status = form.querySelector('[role="status"]');
      button.disabled = true;
      form.setAttribute('aria-busy', 'true');
      status.textContent = '記録しています…';
      try {
        const command = pendingCommand(pending, form, `effort-${form.dataset.taskId}-${form.dataset.activity}`,
          'マイページから実働を記録', {
            activity: form.dataset.activity,
            minutesDelta: Number(form.elements.minutes.value),
            occurredOn: form.elements.occurredOn.value,
            note: form.elements.note.value.trim(),
          });
        const response = await apiFetch(`/api/tasks/${encodeURIComponent(form.dataset.taskId)}/effort`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': command.requestId },
          body: JSON.stringify(command.body),
        });
        if (!response.ok) throw new Error(String(response.status));
        const result = await response.json();
        form.closest('.effort-item').querySelector('[data-effort-total]').textContent = `${result.totalMinutes}分`;
        status.textContent = `記録しました（累計 ${result.totalMinutes}分）`;
        pending.delete(form);
        form.elements.minutes.value = '';
        form.elements.note.value = '';
      } catch {
        status.textContent = '記録できませんでした。日付・時間・権限を確認して再度お試しください。';
      } finally {
        button.disabled = false;
        form.removeAttribute('aria-busy');
      }
    });
    form.addEventListener('input', () => pending.delete(form));
  });
}

function initProject({ connected = false, projectId, changeDraft } = {}) {
  const pendingPayments = new WeakMap();
  const pendingChanges = new WeakMap();
  const pendingStates = new WeakMap();
  document.querySelectorAll('[data-decision]').forEach((button) => button.addEventListener('click', async () => {
    const application = button.closest('.application');
    const approved = button.dataset.decision === 'approve';
    application.querySelectorAll('button').forEach((item) => { item.disabled = true; });
    if (connected) {
      const action = approved ? 'approve' : 'decline';
      application.querySelector('.status-message').textContent = approved ? '承認処理中です…' : '見送り処理中です…';
      try {
        const command = pendingCommand(pendingStates, button,
          `${action}-${application.dataset.application}`,
          approved ? '案件管理画面で条件を確認して承認' : '案件管理画面で応募を見送り');
        const response = await apiFetch(`/api/applications/${encodeURIComponent(application.dataset.application)}/${action}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-request-id': command.requestId },
          body: JSON.stringify(command.body),
        });
        if (!response.ok) throw new Error(String(response.status));
        location.reload();
        return;
      } catch {
        application.querySelector('.status-message').textContent = '処理できませんでした。条件と状態を確認して再度お試しください。';
        application.querySelectorAll('button').forEach((item) => { item.disabled = false; });
        return;
      }
    }
    application.querySelector('.status-message').textContent = approved
      ? '承認しました。金額確定はサービス側の成立処理で行います。'
      : '今回は見送りにしました。';
    application.querySelector('.state-text').textContent = approved ? '承認済み' : '見送り';
  }));

  const review = async (key, task, action, body) => {
    task.setAttribute('aria-busy', 'true');
    task.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    const status = task.querySelector('.status-message');
    status.textContent = action === 'accept' ? '検収処理中です…' : '差戻しを記録中です…';
    try {
      const command = pendingCommand(pendingStates, key, `${action}-${task.dataset.taskId}`,
        action === 'accept' ? '案件管理画面で納品を検収' : body.reason, body);
      const response = await apiFetch(`/api/tasks/${encodeURIComponent(task.dataset.taskId)}/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': command.requestId },
        body: JSON.stringify(command.body),
      });
      if (!response.ok) throw new Error(String(response.status));
      location.reload();
    } catch {
      task.removeAttribute('aria-busy');
      task.querySelectorAll('button').forEach((button) => { button.disabled = false; });
      const confirmation = task.querySelector('[data-delivery-confirm]');
      if (confirmation) task.querySelector('[data-task-review="accept"]').disabled = !confirmation.checked;
      status.textContent = '処理できませんでした。納品状態と入力内容を確認してください。';
    }
  };
  document.querySelectorAll('[data-delivery-confirm]').forEach((checkbox) => checkbox.addEventListener('change', () => {
    checkbox.closest('.project-task').querySelector('[data-task-review="accept"]').disabled = !checkbox.checked;
  }));
  document.querySelectorAll('[data-task-review="accept"]').forEach((button) => button.addEventListener('click', () => {
    void review(button, button.closest('.project-task'), 'accept', { deliveryConfirmed: true });
  }));
  document.querySelectorAll('[data-task-return]').forEach((form) => form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.checkValidity()) return form.reportValidity();
    const values = new FormData(form);
    void review(form, form.closest('.project-task'), 'return', {
      kind: values.get('kind'), reason: values.get('reason'),
      missingCompletionCriteria: [values.get('criterion')],
    });
  }));
  document.querySelectorAll('[data-task-return]').forEach((form) =>
    form.addEventListener('input', () => pendingStates.delete(form)));
  document.querySelectorAll('[data-payment-obligation]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) return form.reportValidity();
    const task = form.closest('.project-task');
    const button = form.querySelector('button[type="submit"]');
    const status = task.querySelector('.status-message');
    let command = pendingPayments.get(form);
    if (!command) {
      const requestId = crypto.randomUUID();
      command = { requestId, body: { dueOn: form.elements.dueOn.value,
        invoiceReference: form.elements.invoiceReference.value.trim(),
        holdReason: form.elements.holdReason.value.trim(),
        idempotencyKey: `payment-plan-${task.dataset.taskId}-${requestId}`,
        reason: '案件管理画面から支払予定を作成' } };
      pendingPayments.set(form, command);
    }
    form.querySelectorAll('input, textarea, button').forEach((control) => { control.disabled = true; });
    status.textContent = '支払予定を作成中です…';
    try {
      const response = await apiFetch(`/api/tasks/${encodeURIComponent(task.dataset.taskId)}/payment-obligations`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': command.requestId },
        body: JSON.stringify(command.body),
      });
      if (!response.ok) throw new Error(String(response.status));
      location.reload();
    } catch {
      button.disabled = false;
      status.textContent = '保存結果を確認できませんでした。同じ内容で再試行するか、画面を更新してください。';
    }
  }));
  document.querySelectorAll('[data-change-request]').forEach((form) => {
    const confirmation = form.querySelector('[data-change-confirm]');
    const confirmButton = form.querySelector('[data-confirm-change]');
    const status = form.querySelector('.status-message');
    const invalidatePreview = () => {
      pendingChanges.delete(form);
      confirmation.hidden = true;
      status.textContent = '';
    };
    form.addEventListener('input', invalidatePreview);
    form.querySelectorAll('[data-add-change-work-order]').forEach((button) => button.addEventListener('click', () => {
      const sourceIndex = Number(button.dataset.addChangeWorkOrder);
      const source = changeDraft.workOrders[sourceIndex];
      const taskTerms = source.terms.taskTerms;
      const sequence = form.querySelectorAll('[data-created-work-order]').length + 1;
      const taskId = crypto.randomUUID();
      const members = changeDraft.members.length ? changeDraft.members : [{
        id: source.memberId, label: source.memberName, membership: source.terms.membership || 'none',
      }];
      const memberOptions = members.map((member) => `<option value="${escapeHtml(member.id)}"${member.id === source.memberId ? ' selected' : ''}>${escapeHtml(member.label)}</option>`).join('');
      const total = BigInt(source.lockedBase) + BigInt(source.lockedBonus);
      form.querySelector('[data-change-created-list]').insertAdjacentHTML('beforeend', `<fieldset class="field" data-created-work-order data-source-index="${sourceIndex}" data-task-id="${escapeHtml(taskId)}">
        <legend>追加工程${sequence}</legend>
        <label>追加工程${sequence}のタスクキー
          <input data-created-task-key value="${escapeHtml(`${source.taskKey}-part-${sequence}`)}" required maxlength="100">
        </label>
        <label>追加工程${sequence}のタスク名
          <input data-created-name value="${escapeHtml(`${taskTerms.name} ${sequence}`)}" required maxlength="200">
        </label>
        <label>追加工程${sequence}の担当者
          <select data-created-member required>${memberOptions}</select>
        </label>
        <label>追加工程${sequence}の手取り（円）
          <input data-created-amount inputmode="numeric" pattern="[1-9][0-9]*" value="${total}" required>
        </label>
        <label>追加工程${sequence}の工数（時間）
          <input data-created-hours type="number" min="0.1" step="0.1" value="${Number(taskTerms.hoursX10) / 10}" required>
        </label>
        <label>追加工程${sequence}の完了条件
          <textarea data-created-completion required>${escapeHtml(taskTerms.completionCriteria)}</textarea>
        </label>
      </fieldset>`);
      invalidatePreview();
      status.textContent = `追加工程${sequence}を追加しました。`;
      form.querySelector('[data-change-created-list]').lastElementChild
        .querySelector('[data-created-task-key]').focus();
    }));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!connected || !form.checkValidity()) return form.reportValidity();
      const requestId = crypto.randomUUID();
      const nextWorkOrders = changeDraft.workOrders.map((draft, index) => {
        const { memberName, completionCriteria, ...workOrder } = draft;
        const selectedAction = form.querySelector(`[data-change-action="${index}"]`).value;
        if (selectedAction !== 'replace') {
          return { ...workOrder, action: 'release', releaseMode: selectedAction };
        }
        const terms = structuredClone(workOrder.terms);
        terms.taskTerms.completionCriteria = form.querySelector(`[data-change-completion="${index}"]`).value.trim();
        return { ...workOrder, terms };
      });
      const createdSummaries = [];
      form.querySelectorAll('[data-created-work-order]').forEach((created) => {
        const source = changeDraft.workOrders[Number(created.dataset.sourceIndex)];
        const memberId = created.querySelector('[data-created-member]').value;
        const member = changeDraft.members.find((item) => item.id === memberId)
          || { id: memberId, label: source.memberName, membership: source.terms.membership || 'none' };
        const terms = structuredClone(source.terms);
        const taskKey = created.querySelector('[data-created-task-key]').value.trim();
        const name = created.querySelector('[data-created-name]').value.trim();
        Object.assign(terms, {
          membership: member.membership,
          membershipBonusBp: { none: 0, uword: 300, uword_uai: 500 }[member.membership],
        });
        Object.assign(terms.taskTerms, {
          taskId: created.dataset.taskId,
          taskKey,
          name,
          hoursX10: Math.round(Number(created.querySelector('[data-created-hours]').value) * 10),
          completionCriteria: created.querySelector('[data-created-completion]').value.trim(),
        });
        nextWorkOrders.push({
          action: 'create', taskId: created.dataset.taskId, taskKey, memberId,
          lockedBase: created.querySelector('[data-created-amount]').value.trim(), lockedBonus: '0', terms,
        });
        createdSummaries.push(`${taskKey} / ${member.label}: 追加「${name}」`);
      });
      const command = { requestId, body: {
        kind: 'amend_work_orders', baseProjectVersion: changeDraft.projectVersion,
        nextGross: form.elements.nextGross.value.trim(), nextWorkOrders,
        idempotencyKey: `change-${projectId}-${requestId}`,
        reason: '案件管理画面から条件変更を提案',
      } };
      pendingChanges.set(form, command);
      form.querySelector('[data-change-gross]').textContent = `受注額: ${formatYen(changeDraft.nextGross)} → ${formatYen(command.body.nextGross)}`;
      const summary = form.querySelector('[data-change-summary]');
      const summaryLines = changeDraft.workOrders.map((draft, index) => {
        const item = document.createElement('li');
        const next = command.body.nextWorkOrders[index];
        item.textContent = next.action === 'release'
          ? `${draft.taskKey} / ${draft.memberName}: ${next.releaseMode === 'remove' ? '削除' : '再募集'}`
          : `${draft.taskKey} / ${draft.memberName}: ${draft.completionCriteria} → ${next.terms.taskTerms.completionCriteria}`;
        return item;
      });
      summary.replaceChildren(...summaryLines, ...createdSummaries.map((line) => {
        const item = document.createElement('li');
        item.textContent = line;
        return item;
      }));
      confirmation.hidden = false;
      status.textContent = '内容を確認し、問題なければ確認依頼を作成してください。';
      confirmation.focus({ preventScroll: true });
    });
    confirmButton.addEventListener('click', async () => {
      const command = pendingChanges.get(form);
      if (!command) return;
      form.querySelectorAll('input, textarea, button').forEach((control) => { control.disabled = true; });
      status.textContent = '確認依頼を作成中です…';
      try {
        const response = await apiFetch(`/api/projects/${encodeURIComponent(projectId)}/change-requests`, {
          method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': command.requestId },
          body: JSON.stringify(command.body),
        });
        if (!response.ok) throw new Error(String(response.status));
        const result = await response.json();
        status.textContent = `確認依頼を作成しました。対象 ${result.affectedMemberIds.length}名、有効期限 ${formatDate(result.expiresAt)}、確認番号 ${result.previewHash}`;
      } catch {
        form.querySelectorAll('input, textarea, button').forEach((control) => { control.disabled = false; });
        status.textContent = '作成できませんでした。金額・契約条件・現在の状態を確認してください。';
      }
    });
  });
}

function initProjectEditor(data) {
  const form = document.querySelector('#project-form');
  const error = document.querySelector('#project-form-error');
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      error.textContent = '必須項目と公開前の確認を入力してください。';
      form.reportValidity();
      return;
    }
    error.textContent = '';
    const selected = data.editor.allocationPreviews[document.querySelector('#allocation-template').value];
    document.querySelector('#preview-project-title').textContent = document.querySelector('#project-title').value.trim();
    document.querySelector('#preview-summary').textContent = selected.summary;
    document.querySelector('#preview-rows').innerHTML = balanceRows(selected.rows);
    document.querySelector('#preview-status').textContent = selected.status;
    const preview = document.querySelector('#allocation-preview');
    preview.hidden = false;
    preview.focus({ preventScroll: true });
    preview.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
  });
}

function initConnectedProjectEditor() {
  const form = document.querySelector('#connected-project-form');
  const status = document.querySelector('#connected-project-status');
  let command;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) {
      status.textContent = '必須項目と確認欄を入力してください。';
      form.reportValidity();
      return;
    }
    if (!command) {
      const requestId = crypto.randomUUID();
      const values = form.elements;
      command = { requestId, body: {
        idempotencyKey: `project-bundle-${requestId}`, reason: '案件編集画面から下書きと初期タスクを作成',
        project: { code: values.code.value.trim(), title: values.title.value.trim(),
          clientId: values.clientId.value, category: values.category.value.trim(),
          summary: values.summary.value.trim(), details: values.details.value.trim(),
          gross: values.gross.value, directCost: values.directCost.value,
          amMemberId: values.amMemberId.value, fundingStatus: values.fundingStatus.value,
          subcontractingConfirmed: values.subcontractingConfirmed.checked,
          dataClassification: values.dataClassification.value.trim(),
          customerNameDisclosure: values.customerNameDisclosure.value.trim() },
        task: { key: values.taskKey.value.trim(), name: values.taskName.value.trim(),
          skills: values.skills.value.split(',').map((item) => item.trim()).filter(Boolean),
          hoursX10: Math.round(Number(values.hours.value) * 10),
          difficultyX10: Number(values.difficultyX10.value),
          responsibilityX10: Number(values.responsibilityX10.value),
          deliverable: values.deliverable.value.trim(), deliveryFormat: values.deliveryFormat.value.trim(),
          scope: values.scope.value.trim(), exclusions: values.exclusions.value.trim(),
          completionCriteria: values.completionCriteria.value.trim(),
          rejectionExamples: values.rejectionExamples.value.trim(),
          suppliedMaterials: values.suppliedMaterials.value.trim(), deadline: values.deadline.value,
          unpaidRevisionScope: values.unpaidRevisionScope.value.trim(),
          unpaidRevisionLimit: Number(values.unpaidRevisionLimit.value),
          ipTerms: values.ipTerms.value.trim(), aiUseTerms: values.aiUseTerms.value.trim(),
          thirdPartyMaterialsTerms: values.thirdPartyMaterialsTerms.value.trim(),
          cancellationTerms: values.cancellationTerms.value.trim() },
      } };
    }
    form.querySelectorAll('input, textarea, select, button').forEach((control) => { control.disabled = true; });
    status.textContent = '下書き保存と配分計算を実行中です…';
    try {
      const response = await apiFetch('/api/projects', { method: 'POST',
        headers: { 'content-type': 'application/json', 'x-request-id': command.requestId },
        body: JSON.stringify(command.body) });
      if (!response.ok) throw new Error(String(response.status));
      const result = await response.json();
      const preview = document.querySelector('#connected-allocation-preview');
      document.querySelector('#connected-preview-rows').innerHTML = balanceRows([
        { label: '手取り見込', value: formatYen(result.preview.payout) },
        { label: '紹介', value: formatYen(result.preview.referral) },
        { label: '協会フィー', value: formatYen(result.preview.systemFee) },
        { label: '未配分', value: formatYen(result.preview.unallocated) },
        { label: '原資', value: formatYen(result.preview.net) },
      ]);
      document.querySelector('#connected-preview-status').textContent = result.preview.conserved
        ? '保存則一致。下書きとして保存しました。' : '配分が一致しないため公開できません。';
      document.querySelector('#connected-project-link').href = `/projects/${encodeURIComponent(result.projectId)}`;
      status.textContent = '';
      preview.hidden = false;
      preview.focus({ preventScroll: true });
    } catch {
      form.querySelector('button[type="submit"]').disabled = false;
      status.textContent = '保存結果を確認できませんでした。同じ内容で再試行するか、画面を更新してください。';
    }
  });
}

function initChange({ connected = false, changeId = null } = {}) {
  const status = document.querySelector('#consent-status');
  const panel = document.querySelector('#consult-panel');
  const consultButton = document.querySelector('[data-consent="consult"]');
  const pendingCommands = new Map();
  if (!panel || !consultButton) return;
  const setConsultOpen = (open) => {
    panel.hidden = !open;
    consultButton.setAttribute('aria-expanded', String(open));
  };
  const send = async (action, payload = {}) => {
    const buttons = document.querySelectorAll('[data-consent], #consult-panel button');
    buttons.forEach((button) => { button.disabled = true; });
    status.parentElement.setAttribute('aria-busy', 'true');
    status.textContent = action === 'consult' ? '相談を記録中です…' : '回答を記録中です…';
    try {
      let command = pendingCommands.get(action);
      if (!command) {
        const requestId = crypto.randomUUID();
        command = {
          requestId,
          body: {
            idempotencyKey: `change-${changeId}-${action}-${requestId}`,
            reason: action === 'consult' ? '変更同意画面から相談' : `変更同意画面から${action}`,
            ...payload,
          },
        };
        pendingCommands.set(action, command);
      }
      const response = await apiFetch(`/api/change-requests/${encodeURIComponent(changeId)}/${action}`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': command.requestId },
        body: JSON.stringify(command.body),
      });
      if (!response.ok) throw new Error(String(response.status));
      const result = await response.json();
      pendingCommands.delete(action);
      if (action === 'consult') {
        status.textContent = '相談を記録しました。これは承認ではありません。';
        setConsultOpen(false);
        buttons.forEach((button) => { button.disabled = false; });
      } else {
        status.textContent = action === 'reject' ? 'この変更を拒否しました。現在の条件を維持します。'
          : result.applied ? 'この変更を承認し、変更が適用されました。'
            : 'この変更を承認しました。他の必要な承認を待っています。';
      }
    } catch {
      status.textContent = '回答を記録できませんでした。状態を更新して再度お試しください。';
      buttons.forEach((button) => { button.disabled = false; });
    } finally {
      status.parentElement.removeAttribute('aria-busy');
      status.focus();
    }
  };
  document.querySelectorAll('[data-consent]').forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.consent === 'consult') {
      status.textContent = '相談中です。相談は承認ではありません。';
      setConsultOpen(true);
      document.querySelector('#consult-message').focus();
      return;
    }
    setConsultOpen(false);
    if (connected) {
      void send(button.dataset.consent);
      return;
    }
    status.textContent = button.dataset.consent === 'approve'
      ? 'この変更を承認しました（ローカル表示のみ）。'
      : 'この変更を拒否しました。現在の条件を維持します（ローカル表示のみ）。';
  }));
  panel.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!panel.checkValidity()) return panel.reportValidity();
    if (connected) {
      void send('consult', { comment: document.querySelector('#consult-message').value.trim() });
      return;
    }
    status.textContent = '相談を記録しました。これは承認ではありません。';
    setConsultOpen(false);
    status.focus();
  });
}

function initAdmin({ connected = false } = {}) {
  const pendingPayments = new WeakMap();
  const filter = document.querySelector('#admin-filter');
  const status = document.querySelector('#filter-status');
  filter.addEventListener('change', () => {
    let visible = 0;
    document.querySelectorAll('.diagnostic').forEach((item) => {
      item.hidden = filter.value !== 'all' && item.dataset.state !== filter.value;
      if (!item.hidden) visible += 1;
    });
    status.textContent = `${visible}件を表示中`;
  });
  if (!connected) return;
  document.querySelectorAll('[data-payment-event]').forEach((form) => form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) return form.reportValidity();
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector('.status-message');
    let command = pendingPayments.get(form);
    if (!command) {
      const requestId = crypto.randomUUID();
      command = { requestId, body: { kind: 'paid', amount: form.dataset.amount,
        paymentReference: form.elements.paymentReference.value.trim(),
        paidAt: new Date(`${form.elements.paidAt.value}:00+09:00`).toISOString(),
        idempotencyKey: `payment-event-${form.dataset.obligationId}-${requestId}`,
        reason: '管理画面で手動振込を確認' } };
      pendingPayments.set(form, command);
    }
    form.querySelectorAll('input, button').forEach((control) => { control.disabled = true; });
    status.textContent = '支払記録を保存中です…';
    try {
      const response = await apiFetch(`/api/admin/payment-obligations/${encodeURIComponent(form.dataset.obligationId)}/events`, {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-request-id': command.requestId },
        body: JSON.stringify(command.body),
      });
      if (!response.ok) throw new Error(String(response.status));
      location.reload();
    } catch {
      button.disabled = false;
      status.textContent = '保存結果を確認できませんでした。同じ記録で再試行するか、画面を更新してください。';
    }
  }));
}

async function start() {
  const connected = false;
  let data;
  let screen;
  const detailMatch = path.match(taskDetailPath);
  const projectMatch = path.match(projectPath);
  const changeMatch = path.match(changePath);
  if (connected && path === '/tasks') {
    const response = await apiFetch('/api/tasks');
    if (!response.ok) throw new Error('task response failed');
    data = connectedListData(await response.json());
    screen = taskListScreen;
  } else if (connected && path === '/me') {
    const response = await apiFetch('/api/me');
    if (!response.ok) throw new Error('member dashboard response failed');
    data = connectedMyData(await response.json());
    screen = myPageScreen;
  } else if (connected && detailMatch) {
    const response = await apiFetch(`/api/tasks/${encodeURIComponent(detailMatch[1])}`);
    if (!response.ok) throw new Error('task detail response failed');
    data = {
      meta: connectedListData([]).meta,
      tasks: [connectedTask(await response.json())],
    };
    screen = taskDetailScreen;
  } else if (connected && projectMatch) {
    const [response, changeDraftResponse] = await Promise.all([
      apiFetch(`/api/projects/${encodeURIComponent(projectMatch[1])}`),
      apiFetch(`/api/projects/${encodeURIComponent(projectMatch[1])}/change-draft`),
    ]);
    if (!response.ok || !changeDraftResponse.ok) throw new Error('project response failed');
    data = connectedProjectData(await response.json(), await changeDraftResponse.json());
    screen = projectScreen;
  } else if (connected && changeMatch) {
    const response = await apiFetch(`/api/change-requests/${encodeURIComponent(changeMatch[1])}`);
    if (!response.ok) throw new Error('change request response failed');
    data = connectedChangeData(await response.json());
    screen = changeScreen;
  } else if (connected && path === '/projects/new') {
    const response = await apiFetch('/api/project-editor/options');
    if (!response.ok) throw new Error('project editor options failed');
    data = { meta: { ...connectedListData([]).meta, projectHref: null }, editor: await response.json() };
    screen = connectedProjectEditorScreen;
  } else if (connected && path === '/admin') {
    const projectResponse = await apiFetch('/api/admin/projects');
    if (!projectResponse.ok) throw new Error('admin projects response failed');
    const projects = await projectResponse.json();
    const auditTargets = projects.filter((project) => project.status !== 'draft' || project.hasAllocationSnapshot);
    const diagnostics = await Promise.all(auditTargets.map(async (project) => {
      const response = await apiFetch(`/api/admin/projects/${encodeURIComponent(project.id)}/diagnostics`);
      if (!response.ok) throw new Error('admin diagnostics response failed');
      return response.json();
    }));
    data = connectedAdminData(projects, diagnostics);
    screen = adminScreen;
  } else if (connected) {
    data = connectedListData([]);
    screen = connectedUnavailableScreen;
  } else {
    const response = await fetch(`${basePath}/fixtures.json`);
    if (!response.ok) throw new Error('fixture response failed');
    data = applyTaskRanks(await response.json());
    if (detailMatch) {
      const task = data.tasks.find((item) => item.id === detailMatch[1]);
      if (task) {
        data = { ...data, tasks: [task] };
        screen = taskRank(task).memberOnly && !isUwordMember(data) ? lockedTaskScreen : taskDetailScreen;
      }
    } else {
      screen = screens[path];
    }
  }
  if (!screen) {
    location.replace(routeHref('/tasks'));
    return;
  }

  shell.innerHTML = `${header(data.meta)}<main class="page" id="main">${screen(data)}</main>`;
  shell.removeAttribute('aria-busy');
  document.title = `${document.querySelector('h1').textContent} | U-AI Board${connected ? '' : ' 公開デモ'}`;

  if (path === '/tasks') initTaskList(data);
  if (path === '/me') initMyPage({ connected });
  if (path === '/projects') initProjectBoard(data);
  if (screen === taskDetailScreen) initTaskDetail({ connected, taskId: detailMatch?.[1] });
  if (path === '/projects/project-1' || projectMatch) initProject({
    connected, projectId: data.project.id, changeDraft: data.project.changeDraft,
  });
  if (path === '/projects/project-1/edit') initProjectEditor(data);
  if (path === '/projects/new') initConnectedProjectEditor();
  if (path === '/changes/change-1' || changeMatch) initChange({ connected, changeId: changeMatch?.[1] });
  if (path === '/admin') initAdmin({ connected });
}

start().catch(() => {
  shell.removeAttribute('aria-busy');
  shell.innerHTML = '<main class="page" id="main"><h1>画面を読み込めませんでした</h1><p class="notice notice-warning" role="alert">ページを更新して、もう一度お試しください。</p></main>';
});
