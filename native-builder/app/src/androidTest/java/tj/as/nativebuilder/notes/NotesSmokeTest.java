package tj.as.nativebuilder.notes;

import android.test.ActivityInstrumentationTestCase2;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ListView;

import org.json.JSONArray;

public final class NotesSmokeTest extends ActivityInstrumentationTestCase2<MainActivity> {
    public NotesSmokeTest() {
        super(MainActivity.class);
    }

    @Override
    protected void setUp() throws Exception {
        super.setUp();
        getInstrumentation().getTargetContext()
                .getSharedPreferences("as_native_notes", 0)
                .edit().clear().commit();
    }

    public void testAddNoteIsDisplayedAndPersistedLocally() throws Throwable {
        final MainActivity activity = getActivity();
        runTestOnUiThread(() -> {
            EditText input = activity.findViewById(R.id.note_input);
            Button add = activity.findViewById(R.id.note_add_button);
            input.setText("Native persistence works");
            add.performClick();
        });
        getInstrumentation().waitForIdleSync();

        ListView list = activity.findViewById(R.id.note_list);
        assertEquals("A newly added note should appear in the native list", 1, list.getAdapter().getCount());
        assertEquals("Native persistence works", list.getAdapter().getItem(0));

        String stored = activity.getSharedPreferences("as_native_notes", 0)
                .getString("notes_json", "[]");
        JSONArray notes = new JSONArray(stored);
        assertEquals("The note must be saved to app-private storage", 1, notes.length());
        assertEquals("Native persistence works", notes.getString(0));
    }
}
