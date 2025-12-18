import { useNavigate } from 'react-router-dom';

const PrivacyPolicyPage = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#030014] text-gray-300">
      {/* 背景效果 */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[400px] h-[400px] bg-neutral-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[300px] h-[300px] bg-neutral-600/10 rounded-full blur-[100px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 py-16">
        {/* 返回按钮 */}
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-8"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
          返回
        </button>

        {/* 标题 */}
        <h1 className="text-4xl font-bold text-white mb-2">隐私政策</h1>
        <p className="text-gray-500 mb-12">最后更新日期：2024年11月27日</p>

        <div className="space-y-10 text-gray-300 leading-relaxed">
          {/* 概述 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">概述</h2>
            <p>
              Waule（"我们"、"本平台"）非常重视您的隐私。本隐私政策说明了我们如何收集、使用、
              存储和保护您在使用 waule.com 及相关服务时的个人信息。使用我们的服务即表示您同意
              本政策所述的数据处理方式。
            </p>
          </section>

          {/* 信息收集 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">1. 我们收集的信息</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-white mb-2">1.1 您主动提供的信息</h3>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li><strong>账户信息：</strong>手机号码、昵称、头像</li>
                  <li><strong>创作内容：</strong>您上传的图片、视频、文本提示词</li>
                  <li><strong>支付信息：</strong>交易记录（我们不直接存储银行卡信息）</li>
                  <li><strong>通讯内容：</strong>您与客服的沟通记录</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-white mb-2">1.2 自动收集的信息</h3>
                <ul className="list-disc list-inside space-y-1 ml-4">
                  <li><strong>设备信息：</strong>设备类型、操作系统、浏览器类型</li>
                  <li><strong>日志信息：</strong>IP 地址、访问时间、页面浏览记录</li>
                  <li><strong>使用数据：</strong>功能使用频率、生成任务记录</li>
                  <li><strong>Cookie：</strong>用于维持登录状态和个性化体验</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 信息使用 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">2. 信息使用目的</h2>
            <p className="mb-4">我们收集的信息用于以下目的：</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>提供服务：</strong>处理您的 AI 生成请求，提供创作工具</li>
              <li><strong>账户管理：</strong>验证身份，管理积分和订阅</li>
              <li><strong>服务改进：</strong>分析使用模式，优化产品体验</li>
              <li><strong>安全保障：</strong>检测和防止欺诈、滥用行为</li>
              <li><strong>客户支持：</strong>响应您的咨询和反馈</li>
              <li><strong>法律合规：</strong>履行法律义务，配合监管要求</li>
            </ul>
          </section>

          {/* AI 生成内容 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">3. AI 生成内容的处理</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-white mb-2">3.1 提示词与输入</h3>
                <p>
                  您输入的提示词和上传的参考图片会被发送至第三方 AI 模型服务商（如 OpenAI、Midjourney 等）
                  进行处理。这些服务商有其独立的隐私政策。
                </p>
              </div>
              <div>
                <h3 className="font-medium text-white mb-2">3.2 生成结果</h3>
                <p>
                  AI 生成的图片和视频会存储在我们的服务器或云存储中，您可以随时删除。
                  我们不会将您的生成内容用于训练 AI 模型。
                </p>
              </div>
            </div>
          </section>

          {/* 信息共享 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">4. 信息共享与披露</h2>
            <p className="mb-4">我们不会出售您的个人信息。以下情况我们可能共享信息：</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>服务提供商：</strong>云服务、AI 模型、支付处理等合作伙伴</li>
              <li><strong>法律要求：</strong>响应法院传票、政府调查等法律程序</li>
              <li><strong>安全保护：</strong>保护我们、用户或公众的权利和安全</li>
              <li><strong>业务转让：</strong>如发生合并、收购，您的信息可能被转移</li>
            </ul>
          </section>

          {/* 数据安全 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">5. 数据安全</h2>
            <p className="mb-4">我们采取多种安全措施保护您的信息：</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>使用 SSL/TLS 加密传输数据</li>
              <li>密码采用行业标准加密存储</li>
              <li>定期进行安全审计和漏洞扫描</li>
              <li>限制员工对用户数据的访问权限</li>
              <li>数据备份和灾难恢复机制</li>
            </ul>
            <p className="mt-4 text-gray-400">
              尽管我们采取了合理措施，但互联网传输无法保证 100% 安全。
            </p>
          </section>

          {/* 数据保留 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">6. 数据保留</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>账户信息：在账户有效期间保留，删除账户后 30 天内清除</li>
              <li>生成内容：您可随时删除，未删除的内容将持续保留</li>
              <li>日志数据：通常保留 12 个月</li>
              <li>交易记录：根据法律要求保留至少 5 年</li>
            </ul>
          </section>

          {/* 您的权利 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">7. 您的权利</h2>
            <p className="mb-4">根据适用法律，您可能享有以下权利：</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>访问权：</strong>查看我们持有的您的个人信息</li>
              <li><strong>更正权：</strong>更新或修正不准确的信息</li>
              <li><strong>删除权：</strong>要求删除您的个人信息</li>
              <li><strong>数据可携权：</strong>获取您数据的副本</li>
              <li><strong>撤回同意：</strong>撤回之前给予的同意</li>
            </ul>
            <p className="mt-4">
              如需行使这些权利，请通过下方联系方式与我们联系。
            </p>
          </section>

          {/* Cookie */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">8. Cookie 政策</h2>
            <p className="mb-4">我们使用 Cookie 和类似技术：</p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li><strong>必要 Cookie：</strong>维持登录状态，确保服务正常运行</li>
              <li><strong>功能 Cookie：</strong>记住您的偏好设置</li>
              <li><strong>分析 Cookie：</strong>了解用户如何使用服务，用于改进</li>
            </ul>
            <p className="mt-4">
              您可以通过浏览器设置管理 Cookie，但禁用某些 Cookie 可能影响服务功能。
            </p>
          </section>

          {/* 未成年人 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">9. 未成年人保护</h2>
            <p>
              我们的服务面向 18 周岁及以上用户。我们不会故意收集未成年人的个人信息。
              如果您发现未成年人向我们提供了个人信息，请联系我们，我们将及时删除。
            </p>
          </section>

          {/* 跨境传输 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">10. 跨境数据传输</h2>
            <p>
              为提供 AI 生成服务，您的部分数据可能被传输至中国境外的服务器处理。
              我们会确保数据接收方提供足够的数据保护水平，并遵守适用的数据保护法律。
            </p>
          </section>

          {/* 政策更新 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">11. 隐私政策更新</h2>
            <p>
              我们可能会不时更新本隐私政策。重大变更将通过平台公告或电子邮件通知您。
              我们建议您定期查阅本政策以了解最新信息。
            </p>
          </section>

          {/* 联系我们 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">12. 联系我们</h2>
            <p>
              如您对本隐私政策有任何疑问、意见或请求，请通过以下方式联系我们：
            </p>
            <div className="mt-4 space-y-2">
              <p>邮箱：<span className="text-neutral-400">privacy@waule.com</span></p>
              <p>地址：<span className="text-gray-400">请通过邮件联系获取</span></p>
            </div>
          </section>
        </div>

        {/* 底部 */}
        <div className="mt-16 pt-8 border-t border-white/10 text-center text-gray-500 text-sm">
          <p>© {new Date().getFullYear()} Waule. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicyPage;
