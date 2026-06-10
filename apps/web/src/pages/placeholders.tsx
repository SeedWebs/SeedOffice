import { PageHeader } from '../components/PageHeader'

/** หน้า placeholder — ถูกแทนที่ตาม task: Projects=T08 · Payroll=T15 · Admin=T07 · Dashboard=T11 */

function Coming({ title, task }: { title: string; task: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-xs p-10 text-center text-sm text-slate-400">
          หน้านี้กำลังจะมาใน {task}
        </div>
      </div>
    </>
  )
}

export function DashboardPage() {
  // ภาพรวมไม่มี header (SPEC §4) — เนื้อหาจริงมา T11
  return (
    <div className="p-3 sm:p-6">
      <div className="bg-white rounded-lg shadow-xs p-10 text-center text-sm text-slate-400">
        ภาพรวม (งานวันนี้ + งานเร็วๆ นี้) — กำลังจะมาใน T11
      </div>
    </div>
  )
}

export const ProjectsPage = () => <Coming title="โปรเจกต์" task="T08" />
export const PayrollPage = () => <Coming title="ค่าตอบแทน" task="T15" />
export const AdminPage = () => <Coming title="ตั้งค่า" task="T07" />
