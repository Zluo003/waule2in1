import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function Terms() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-4xl mx-auto px-6 py-16">
        <Link 
          to="/" 
          className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          返回首页
        </Link>

        <h1 className="text-4xl font-bold text-gray-900 mb-8">使用条款</h1>
        
        <div className="prose prose-gray max-w-none">
          <p className="text-gray-600 mb-6">
            生效日期：2024年1月1日<br />
            最后更新：2024年12月24日
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. 服务条款的接受</h2>
            <p className="text-gray-600 leading-relaxed">
              欢迎使用 Waule AI（以下简称"本服务"）。本服务由 waule.com（以下简称"我们"）提供。
              通过访问或使用本服务，您同意受本使用条款（以下简称"条款"）的约束。如果您不同意这些条款，
              请勿使用本服务。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. 服务描述</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Waule AI 是一款企业级 AI 内容创作平台，提供以下服务：
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>AI 视频生成与编辑</li>
              <li>AI 图像创作与处理</li>
              <li>AI 音频合成（即将上线）</li>
              <li>智能分镜脚本生成</li>
              <li>可视化工作流编辑</li>
              <li>团队实时协作功能</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. 用户账户</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              3.1 您可能需要创建账户才能使用本服务的某些功能。您有责任维护账户信息的保密性，
              并对使用您账户进行的所有活动负责。
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              3.2 您同意提供准确、完整和最新的账户信息，并在信息发生变化时及时更新。
            </p>
            <p className="text-gray-600 leading-relaxed">
              3.3 如发现任何未经授权使用您账户的情况，请立即通知我们。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. 用户行为规范</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              您同意在使用本服务时：
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>遵守所有适用的法律法规</li>
              <li>不上传、发布或传播任何违法、有害、威胁性、滥用性、骚扰性、侵权性、诽谤性、
                  粗俗、淫秽或其他令人反感的内容</li>
              <li>不侵犯他人的知识产权或其他权利</li>
              <li>不使用本服务进行任何非法活动</li>
              <li>不试图未经授权访问本服务的任何部分</li>
              <li>不干扰或破坏本服务的正常运行</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. 知识产权</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              5.1 本服务及其原创内容、功能和设计均为我们的财产，受版权、商标和其他知识产权法律保护。
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              5.2 您使用本服务创建的内容，其知识产权归您所有。但您授予我们非独占的、
              全球性的许可，允许我们在提供和改进服务所需的范围内使用该内容。
            </p>
            <p className="text-gray-600 leading-relaxed">
              5.3 您确认并同意，通过 AI 生成的内容可能受到第三方 AI 服务提供商条款的约束。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. 数据安全与隐私</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              6.1 企业版用户的数据存储在企业内部服务器，我们不存储您的创作资产。
            </p>
            <p className="text-gray-600 leading-relaxed">
              6.2 有关我们如何收集、使用和保护您信息的详细说明，请参阅我们的
              <Link to="/privacy" className="text-indigo-600 hover:text-indigo-700">《隐私政策》</Link>。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. 服务变更与终止</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              7.1 我们保留随时修改或终止本服务（或其任何部分）的权利，恕不另行通知。
            </p>
            <p className="text-gray-600 leading-relaxed">
              7.2 如果您违反本条款，我们可能会暂停或终止您对本服务的访问。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. 免责声明</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              8.1 本服务按"现状"和"可用"基础提供，不提供任何明示或暗示的保证。
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              8.2 我们不保证本服务将不间断、及时、安全或无错误。
            </p>
            <p className="text-gray-600 leading-relaxed">
              8.3 AI 生成的内容仅供参考，我们不对其准确性、完整性或适用性作出保证。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. 责任限制</h2>
            <p className="text-gray-600 leading-relaxed">
              在法律允许的最大范围内，我们不对因使用或无法使用本服务而产生的任何直接、间接、
              附带、特殊、惩罚性或后果性损害承担责任，包括但不限于利润损失、数据丢失、
              商誉损失或其他无形损失。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. 适用法律</h2>
            <p className="text-gray-600 leading-relaxed">
              本条款受中华人民共和国法律管辖并按其解释。因本条款引起的任何争议，
              双方应首先通过友好协商解决；协商不成的，任何一方均可向有管辖权的人民法院提起诉讼。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. 条款修改</h2>
            <p className="text-gray-600 leading-relaxed">
              我们保留随时修改本条款的权利。修改后的条款将在本页面发布后生效。
              继续使用本服务即表示您接受修改后的条款。我们建议您定期查看本条款。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. 联系我们</h2>
            <p className="text-gray-600 leading-relaxed">
              如果您对本使用条款有任何疑问，请通过以下方式联系我们：
            </p>
            <p className="text-gray-600 mt-4">
              网站：<a href="https://waule.com" className="text-indigo-600 hover:text-indigo-700">waule.com</a><br />
              邮箱：zluo@aivider.com
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-500">
            © 2024 Waule. All rights reserved.
          </p>
        </div>
      </div>
    </div>
  )
}
