import { PageHeader } from '../components/PageHeader'

/** ตารางรวมทั้งทีม + CSV + ปิดงวด — เนื้อหาจริงมาใน T16 */
export function PayrollOwnerPage() {
  return (
    <>
      <PageHeader title="ค่าตอบแทน" />
      <div className="p-6">
        <div className="bg-white rounded-lg shadow-xs p-10 text-center text-sm text-slate-400">
          ตารางทั้งทีม + Export CSV + ปิดงวด — กำลังจะมาใน T16
        </div>
      </div>
    </>
  )
}
