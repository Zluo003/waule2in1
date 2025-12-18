import { useNavigate } from 'react-router-dom';

const TermsOfServicePage = () => {
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
        <h1 className="text-4xl font-bold text-white mb-2">服务条款</h1>
        <p className="text-gray-500 mb-12">最后更新日期：2024年11月27日</p>

        <div className="space-y-10 text-gray-300 leading-relaxed">
          {/* 欢迎 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">欢迎使用 Waule</h2>
            <p>
              感谢您选择 Waule（"我们"、"本平台"）。本服务条款（"条款"）规定了您访问和使用 Waule 
              网站（waule.com）及相关服务的条件。使用我们的服务即表示您同意受本条款的约束。
              如果您不同意本条款的任何部分，请勿使用我们的服务。
            </p>
          </section>

          {/* 服务说明 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">1. 服务说明</h2>
            <p className="mb-4">
              Waule 是一个基于人工智能技术的内容创作平台，提供以下服务：
            </p>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>AI 视频生成：使用 Sora、Vidu 等模型生成视频内容</li>
              <li>AI 图像创作：使用 Midjourney、Nano Banana Pro 等模型生成图像</li>
              <li>可视化工作流：节点式创作编排工具</li>
              <li>实时协作：多人在线协作创作功能</li>
            </ul>
          </section>

          {/* 账户注册 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">2. 账户注册与安全</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>您必须年满 18 周岁或在您所在司法管辖区达到法定成年年龄</li>
              <li>注册时需提供真实、准确的手机号码</li>
              <li>您有责任保护账户安全，对账户下的所有活动负责</li>
              <li>如发现未经授权的账户使用，请立即通知我们</li>
              <li>我们保留在发现违规行为时暂停或终止账户的权利</li>
            </ul>
          </section>

          {/* 用户内容 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">3. 用户内容与知识产权</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-white mb-2">3.1 您的内容</h3>
                <p>
                  您保留对您上传的原创内容的所有权利。通过使用本服务，您授予我们非独占、
                  全球性、免版税的许可，用于运营和改进服务。
                </p>
              </div>
              <div>
                <h3 className="font-medium text-white mb-2">3.2 AI 生成内容</h3>
                <p>
                  使用我们的 AI 工具生成的内容，其所有权归属依据所使用的 AI 模型服务商条款。
                  我们建议您在商业使用前查阅相关模型的使用许可。
                </p>
              </div>
              <div>
                <h3 className="font-medium text-white mb-2">3.3 禁止内容</h3>
                <p>您不得使用本服务生成或传播以下内容：</p>
                <ul className="list-disc list-inside space-y-1 ml-4 mt-2">
                  <li>违反中华人民共和国法律法规的内容</li>
                  <li>色情、暴力、恐怖主义相关内容</li>
                  <li>侵犯他人知识产权或隐私权的内容</li>
                  <li>虚假信息、欺诈或误导性内容</li>
                  <li>恶意软件或有害程序</li>
                </ul>
              </div>
            </div>
          </section>

          {/* 付费服务 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">4. 付费服务与积分</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>本平台采用积分制，使用 AI 功能将消耗相应积分</li>
              <li>积分一经购买，除法律规定外，不支持退款</li>
              <li>未使用的积分在账户有效期内保持有效</li>
              <li>我们保留调整积分价格和消耗规则的权利，调整前会提前通知</li>
            </ul>
          </section>

          {/* 服务限制 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">5. 服务限制与免责</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>AI 生成结果可能存在不准确或不符合预期的情况</li>
              <li>我们不保证服务不间断或无错误运行</li>
              <li>因第三方 AI 模型服务变更导致的功能变化，我们将尽力提供替代方案</li>
              <li>对于用户生成内容的合法性，用户承担全部责任</li>
            </ul>
          </section>

          {/* 隐私 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">6. 隐私保护</h2>
            <p>
              我们重视您的隐私。有关我们如何收集、使用和保护您的个人信息，
              请参阅我们的<button onClick={() => navigate('/privacy')} className="text-neutral-400 hover:text-neutral-300 underline">隐私政策</button>。
            </p>
          </section>

          {/* 条款修改 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">7. 条款修改</h2>
            <p>
              我们可能会不时更新本条款。重大变更将通过平台公告或电子邮件通知您。
              继续使用服务即表示您接受更新后的条款。
            </p>
          </section>

          {/* 终止 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">8. 服务终止</h2>
            <ul className="list-disc list-inside space-y-2 ml-4">
              <li>您可以随时删除账户并停止使用服务</li>
              <li>我们保留因违反条款而终止您账户的权利</li>
              <li>账户终止后，我们可能会保留必要数据以遵守法律义务</li>
            </ul>
          </section>

          {/* 法律适用 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">9. 法律适用与争议解决</h2>
            <p>
              本条款受中华人民共和国法律管辖。如发生争议，双方应友好协商解决；
              协商不成的，任何一方均可向本平台所在地有管辖权的人民法院提起诉讼。
            </p>
          </section>

          {/* 联系我们 */}
          <section>
            <h2 className="text-xl font-semibold text-white mb-4">10. 联系我们</h2>
            <p>
              如您对本服务条款有任何疑问，请通过以下方式联系我们：
            </p>
            <p className="mt-2">
              邮箱：<span className="text-neutral-400">support@waule.com</span>
            </p>
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

export default TermsOfServicePage;
