import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

export default function Privacy() {
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

        <h1 className="text-4xl font-bold text-gray-900 mb-8">隐私政策</h1>
        
        <div className="prose prose-gray max-w-none">
          <p className="text-gray-600 mb-6">
            生效日期：2024年1月1日<br />
            最后更新：2024年12月24日
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">引言</h2>
            <p className="text-gray-600 leading-relaxed">
              Waule AI（以下简称"我们"）非常重视您的隐私。本隐私政策说明了我们在您使用 waule.com 
              及相关服务（以下简称"服务"）时如何收集、使用、存储和保护您的个人信息。
              请仔细阅读本政策，如有任何疑问，请通过本政策末尾提供的联系方式与我们联系。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">1. 我们收集的信息</h2>
            
            <h3 className="text-xl font-medium text-gray-800 mb-3 mt-6">1.1 您直接提供的信息</h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li><strong>账户信息：</strong>注册时提供的用户名、电子邮箱、密码等</li>
              <li><strong>企业信息：</strong>企业名称、联系方式、行业类型等（企业版用户）</li>
              <li><strong>支付信息：</strong>订阅服务时的支付方式和账单信息</li>
              <li><strong>通信信息：</strong>您与我们客服沟通时的内容</li>
            </ul>

            <h3 className="text-xl font-medium text-gray-800 mb-3 mt-6">1.2 自动收集的信息</h3>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li><strong>设备信息：</strong>设备类型、操作系统、浏览器类型等</li>
              <li><strong>日志信息：</strong>访问时间、IP地址、页面浏览记录等</li>
              <li><strong>使用数据：</strong>功能使用频率、操作习惯等匿名统计数据</li>
            </ul>

            <h3 className="text-xl font-medium text-gray-800 mb-3 mt-6">1.3 关于创作内容</h3>
            <p className="text-gray-600 leading-relaxed">
              <strong>重要说明：</strong>对于企业版用户，您的创作资产（包括图像、视频、音频、
              项目文件等）存储在您的企业内部服务器中，我们不访问、不存储这些内容。
              我们的云服务仅处理 AI 生成请求，不保留任何用户创作数据。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">2. 信息的使用</h2>
            <p className="text-gray-600 leading-relaxed mb-4">我们收集的信息用于：</p>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>提供、维护和改进我们的服务</li>
              <li>处理您的注册和管理您的账户</li>
              <li>处理支付和账单事务</li>
              <li>与您沟通，包括发送服务通知和更新</li>
              <li>提供客户支持</li>
              <li>进行数据分析以改进用户体验</li>
              <li>检测、预防和解决技术问题或安全问题</li>
              <li>遵守法律义务</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">3. 信息的共享</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              我们不会出售您的个人信息。我们可能在以下情况下共享您的信息：
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li><strong>服务提供商：</strong>与帮助我们运营服务的第三方合作伙伴共享
                （如云服务提供商、支付处理商），他们必须遵守严格的数据保护要求</li>
              <li><strong>AI 服务提供商：</strong>为实现 AI 生成功能，我们会向第三方 AI 
                服务提供商发送必要的请求数据，这些提供商有其独立的隐私政策</li>
              <li><strong>法律要求：</strong>当法律要求或为保护我们的权利时</li>
              <li><strong>业务转让：</strong>在合并、收购或资产出售的情况下</li>
              <li><strong>征得同意：</strong>在您明确同意的情况下</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">4. 数据安全</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              我们采取多种安全措施保护您的信息：
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li><strong>传输加密：</strong>使用 TLS 1.3 协议加密所有数据传输</li>
              <li><strong>访问控制：</strong>严格限制对个人信息的访问权限</li>
              <li><strong>本地存储：</strong>企业版用户数据存储在企业内部，不外传</li>
              <li><strong>定期审计：</strong>定期进行安全审计和漏洞评估</li>
              <li><strong>员工培训：</strong>对员工进行数据保护培训</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              尽管我们尽最大努力保护您的信息，但请注意，没有任何互联网传输或电子存储方法是100%安全的。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">5. 数据保留</h2>
            <p className="text-gray-600 leading-relaxed">
              我们仅在实现本政策所述目的所需的时间内保留您的个人信息，除非法律要求或允许更长的保留期。
              账户删除后，我们将在合理时间内删除或匿名化您的个人信息，但可能保留某些信息以履行法律义务、
              解决争议或执行我们的协议。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">6. 您的权利</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              根据适用法律，您可能享有以下权利：
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li><strong>访问权：</strong>请求访问我们持有的关于您的个人信息</li>
              <li><strong>更正权：</strong>请求更正不准确或不完整的信息</li>
              <li><strong>删除权：</strong>请求删除您的个人信息</li>
              <li><strong>限制处理权：</strong>请求限制我们处理您的信息</li>
              <li><strong>数据可携带权：</strong>请求以结构化格式获取您的数据</li>
              <li><strong>撤回同意权：</strong>撤回之前给予的同意</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              如需行使上述权利，请通过本政策末尾的联系方式与我们联系。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">7. Cookie 和类似技术</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              我们使用 Cookie 和类似技术来：
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-2">
              <li>保持您的登录状态</li>
              <li>记住您的偏好设置</li>
              <li>分析服务使用情况</li>
              <li>提供个性化体验</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-4">
              您可以通过浏览器设置管理 Cookie 偏好。禁用 Cookie 可能影响服务的某些功能。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">8. 儿童隐私</h2>
            <p className="text-gray-600 leading-relaxed">
              我们的服务不面向16岁以下的儿童。我们不会故意收集16岁以下儿童的个人信息。
              如果您是家长或监护人，发现您的孩子向我们提供了个人信息，请联系我们，
              我们将采取措施删除该信息。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">9. 国际数据传输</h2>
            <p className="text-gray-600 leading-relaxed">
              您的信息可能被传输到您所在国家/地区以外的服务器并在那里存储和处理。
              我们将采取适当措施确保您的信息得到与本政策一致的保护。
              对于企业版用户，您的创作数据存储在您指定的企业内部服务器中，不进行跨境传输。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">10. 第三方链接</h2>
            <p className="text-gray-600 leading-relaxed">
              我们的服务可能包含指向第三方网站或服务的链接。我们不对这些第三方的隐私做法负责。
              我们建议您在访问任何第三方网站时查阅其隐私政策。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">11. 隐私政策的更新</h2>
            <p className="text-gray-600 leading-relaxed">
              我们可能会不时更新本隐私政策。更新后的政策将在本页面发布，并注明更新日期。
              对于重大变更，我们会通过电子邮件或服务内通知的方式告知您。
              继续使用服务即表示您接受更新后的政策。
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">12. 联系我们</h2>
            <p className="text-gray-600 leading-relaxed">
              如果您对本隐私政策有任何疑问、意见或请求，请通过以下方式联系我们：
            </p>
            <div className="bg-gray-50 rounded-lg p-6 mt-4">
              <p className="text-gray-700">
                <strong>Waule AI</strong><br /><br />
                网站：<a href="https://waule.com" className="text-indigo-600 hover:text-indigo-700">waule.com</a><br />
                邮箱：zluo@aivider.com
              </p>
            </div>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">13. 争议解决</h2>
            <p className="text-gray-600 leading-relaxed">
              本隐私政策受中华人民共和国法律管辖。如就本政策内容或执行发生任何争议，
              双方应首先友好协商解决；协商不成的，任何一方均可向有管辖权的人民法院提起诉讼。
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
