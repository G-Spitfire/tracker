import json
import tempfile
import unittest
from pathlib import Path
import school_export as s

class ExportTests(unittest.TestCase):
    def test_preserves_learning_values_and_unknown_keys(self):
        body={'data':{'items':[{'lesson_date':'2026-11-11','subject_name':'Математика','home_work':'Решить №12','unknown_school_field':17,'direction':'IN'}]}}
        self.assertEqual(s.sanitize(body),body)

    def test_removes_nested_credentials_and_signed_links(self):
        body={'accessToken':'secret1','nested':[{'session_id':'secret2','password':'secret3','Cookie':'secret4'}], 'file':'https://school.test/a?token=secret5&lesson=12','text':'Authorization: Bearer abc.def.ghi'}
        result=json.dumps(s.sanitize(body))
        for secret in ('secret1','secret2','secret3','secret4','secret5','abc.def.ghi'):
            self.assertNotIn(secret,result)
        self.assertIn('lesson=12',result)

    def test_route_and_query_scope(self):
        self.assertIsNone(s.request_metadata('https://evil.test/api/journal/lesson/list','GET'))
        self.assertIsNone(s.request_metadata('https://'+s.HOST+'/api/journal/user/get-current-user','GET'))
        result=s.request_metadata('https://'+s.HOST+'/api/journal/lesson/list-by-dates?p_education=5&access_token=secret','GET')
        self.assertEqual(result['query'],[['p_education','5']])
        self.assertIsNone(s.request_metadata('https://'+s.HOST+'/api/journal/lesson/save','PUT'))

    def test_raw_record_and_field_evidence_not_guessed_mapping(self):
        r=s.make_record('https://'+s.HOST+'/api/journal/lesson/list-by-dates?p_page=1','GET',200,{'data':{'items':[{'number':2,'subject_name':'Алгебра','homework':'№7'}],'total_pages':2}})
        self.assertEqual(r['response']['data']['items'][0]['homework'],'№7')
        summary=s.summarize([r])
        self.assertIn('data.items[].homework',summary['endpoints'][0]['fields'])
        self.assertFalse(summary['complete_export'])
        self.assertEqual(summary['endpoints'][0]['total_pages'],[2])

    def test_private_exclusive_file_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/'capture.json'
            s.write_private(p,{'a':1})
            self.assertEqual(p.stat().st_mode & 0o777,0o600)
            with self.assertRaises(FileExistsError): s.write_private(p,{'a':2})
            self.assertEqual(json.loads(p.read_text()),{'a':1})



class ErrorTests(unittest.TestCase):
    def test_http_200_error_is_not_success(self):
        r=s.make_record('https://'+s.HOST+'/api/journal/lesson/list','GET',200,{'data':None,'validations':['invalid selector']})
        self.assertFalse(r['api_ok'])
        self.assertEqual(s.summarize([r])['successful_responses'],0)

    def test_empty_page_not_proof_of_missing_homework(self):
        r=s.make_record('https://'+s.HOST+'/api/journal/lesson/list','GET',200,{'data':{'items':[]}})
        self.assertTrue(r['api_ok'])
        self.assertFalse(s.summarize([r])['complete_export'])

    def test_debug_and_auth_envelopes_not_saved(self):
        body={'data':{'homework':'текст '*10000,'auth':{'value':'opaque-secret'}},'debug':['Cookie: opaque-cookie']}
        r=s.sanitize(body)
        self.assertFalse('opaque-secret' in json.dumps(r))
        self.assertFalse('opaque-cookie' in json.dumps(r))
        self.assertEqual(r['data']['homework'],body['data']['homework'])

    def test_secret_url_credentials_and_fragment_removed(self):
        result=s.sanitize({'link':'https://user:pass@school.test/a?sig=opaque&lesson_id=4#access_token=opaque2'})
        self.assertEqual(result['link'],'https://school.test/a?lesson_id=4')



class RequestParameterTests(unittest.TestCase):
    def test_keeps_non_auth_query_filters_and_post_json(self):
        r=s.make_record('https://'+s.HOST+'/api/journal/attendance/list?education_id=9&date=2026-11-11&token=secret','POST',200,{'data':{'items':[]}},post_data='{"student_id":9,"date_from":"2026-11-01","access_token":"secret"}')
        self.assertEqual(r['query'],[['education_id','9'],['date','2026-11-11']])
        self.assertEqual(r['json_body'],{'student_id':9,'date_from':'2026-11-01'})

    def test_does_not_save_non_json_post_body(self):
        r=s.make_record('https://'+s.HOST+'/api/journal/attendance/list','POST',200,{'data':{}},post_data='opaque-password')
        self.assertNotIn('opaque-password',json.dumps(r))
        self.assertTrue(r['request_body_omitted'])



class ReviewRegressionTests(unittest.TestCase):
    def test_conventional_auth_envelopes_and_keys_removed(self):
        result=s.sanitize({'authentication':{'value':'opaque-secret'},'access_key':'opaque-key','apiKey':'opaque-api'})
        self.assertEqual(result,{})

    def test_learning_fields_containing_credential_words_preserved(self):
        body={'lesson_session':'утро','token_count':12,'signature_date':'2026-11-11'}
        self.assertEqual(s.sanitize(body),body)

    def test_summary_accepts_stream_without_losing_success_count(self):
        r=s.make_record('https://'+s.HOST+'/api/journal/lesson/list','GET',200,{'data':{'items':[]}})
        self.assertEqual(s.summarize(iter([r]))['successful_responses'],1)

    def test_sink_refuses_limit_without_losing_previous_record(self):
        with tempfile.TemporaryDirectory() as d:
            sink=s.CaptureSink(Path(d), max_responses=1, max_bytes=10000)
            r=s.make_record('https://'+s.HOST+'/api/journal/lesson/list','GET',200,{'data':{'items':[]}})
            self.assertTrue(sink.save(r))
            self.assertFalse(sink.save(r))
            self.assertEqual(len(list(Path(d).glob('response-*.json'))),1)
            self.assertTrue(sink.summary()['limit_reached'])
            self.assertEqual(sink.summary()['successful_responses'],1)

    def test_sink_byte_limit_explicit_and_never_truncates_homework(self):
        with tempfile.TemporaryDirectory() as d:
            sink=s.CaptureSink(Path(d), max_responses=10, max_bytes=10)
            self.assertFalse(sink.save({'response':{'homework':'текст'*100}}))
            self.assertEqual(list(Path(d).iterdir()),[])
            self.assertTrue(sink.summary()['limit_reached'])



class CaptureIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def test_passive_capture_saves_response_and_closes_cleanly(self):
        import asyncio
        import io
        import types
        from unittest.mock import patch
        class Response:
            url='https://'+s.HOST+'/api/journal/lesson/list-by-dates?p_page=1'
            status=200
            request=types.SimpleNamespace(method='GET',post_data=None)
            async def header_value(self,key):
                return 'application/json' if key=='content-type' else None
            async def body(self):
                return json.dumps({'data':{'items':[{'homework':'Решить №4','access_token':'secret'}]}}).encode()
        class Context:
            closed=False
            def on(self,event,callback):
                loop=asyncio.get_running_loop()
                if event=='response': loop.call_soon(callback,Response())
                if event=='close': loop.call_later(0.05,callback)
            def remove_listener(self,*args): pass
            async def close(self): self.closed=True
        context=Context()
        async def launch(*args,**kwargs): return context
        class Manager:
            async def __aenter__(self):
                return types.SimpleNamespace(chromium=types.SimpleNamespace(launch_persistent_context=launch))
            async def __aexit__(self,*args): pass
        module=types.ModuleType('playwright.async_api')
        module.async_playwright=Manager
        with tempfile.TemporaryDirectory() as d:
            root=Path(d);profile=root/'profile';profile.mkdir()
            args=types.SimpleNamespace(profile=profile,output_dir=root/'out',probe=False)
            with patch.dict('sys.modules',{'playwright.async_api':module}),patch('sys.stdout',new=io.StringIO()):
                code=await s.capture(args)
            self.assertEqual(code,0)
            record=json.loads(next((root/'out').glob('*/response-*.json')).read_text())
            self.assertEqual(record['response']['data']['items'],[{'homework':'Решить №4'}])
            self.assertTrue(context.closed)
            summary=json.loads(next((root/'out').glob('*/summary.json')).read_text())
            self.assertEqual(summary['successful_responses'],1)
            self.assertFalse(summary['complete_export'])



class ExistingAttendanceTests(unittest.TestCase):
    def test_extracts_observed_attendance_type_preserving_reason_date_and_subject(self):
        record={'id':11,'date':'11.11.2026','subject_name':'Алгебра','estimate_type_code':'30000','estimate_type_name':'Посещаемость','estimate_value_code':'496','estimate_value_name':'по болезни','lesson_id':7}
        source={'updated_at':'2026-11-11T07:55:00+03:00','range_from':'2026-09-01','range_to':'2026-11-11','students':{'9':{'label':'synthetic','grades':[record,{'id':12,'estimate_type_code':'1058','estimate_value_name':'5'}]}}}
        result=s.extract_attendance(source)
        self.assertEqual(result['students']['9']['attendance'],[record])
        self.assertEqual(result['attendance_count'],1)
        self.assertEqual(result['source_record_count'],2)
        self.assertFalse(result['complete_export'])
        self.assertEqual(source['students']['9']['grades'][0],record)

    def test_rejects_invalid_source_instead_of_reporting_no_absences(self):
        with self.assertRaises(ValueError): s.extract_attendance({'students':{'9':{'grades':None}}})

if __name__=='__main__': unittest.main()
